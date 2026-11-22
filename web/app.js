/* =========================================================
   Кошелёк — логика
   Чистый JS без сборки и зависимостей.
   Данные лежат в localStorage, формат — см. объект db ниже.
   ========================================================= */
(function () {
  'use strict';

  var APP_VERSION = '1.0.0';
  var LS_KEY = 'wallet.db.v1';

  var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  var CURRENCIES = [
    { code: 'RUB', sym: '₽' },
    { code: 'USD', sym: '$' },
    { code: 'EUR', sym: '€' },
    { code: 'KZT', sym: '₸' },
    { code: 'UAH', sym: '₴' },
    { code: 'GEL', sym: '₾' }
  ];

  // Категории. Чтобы добавить свою — просто допиши объект в нужный массив.
  var CATS = {
    expense: [
      { id: 'food',      name: 'Продукты',    emoji: '🛒', color: '#34c759' },
      { id: 'cafe',      name: 'Кафе',        emoji: '☕️', color: '#ff9500' },
      { id: 'transport', name: 'Транспорт',   emoji: '🚕', color: '#007aff' },
      { id: 'home',      name: 'Жильё',       emoji: '🏠', color: '#5856d6' },
      { id: 'health',    name: 'Здоровье',    emoji: '💊', color: '#ff3b30' },
      { id: 'shopping',  name: 'Покупки',     emoji: '🛍️', color: '#ff2d55' },
      { id: 'fun',       name: 'Развлечения', emoji: '🎬', color: '#af52de' },
      { id: 'subs',      name: 'Подписки',    emoji: '📱', color: '#32ade6' },
      { id: 'other',     name: 'Прочее',      emoji: '📦', color: '#8e8e93' }
    ],
    income: [
      { id: 'salary',  name: 'Зарплата', emoji: '💰', color: '#34c759' },
      { id: 'freelance', name: 'Фриланс', emoji: '💻', color: '#007aff' },
      { id: 'gift',    name: 'Подарки',  emoji: '🎁', color: '#ff2d55' },
      { id: 'other-i', name: 'Прочее',   emoji: '📦', color: '#8e8e93' }
    ]
  };

  var FALLBACK_CAT = { name: 'Без категории', emoji: '•', color: '#8e8e93' };

  /* ---------- состояние ---------- */

  var db = { v: 1, currency: 'RUB', items: [] };
  var cur = '';                 // текущий месяц 'YYYY-MM'
  var statsType = 'expense';
  var editingId = null;         // null = новая запись
  var draft = { type: 'expense', cat: 'food' };

  /* ---------- мелкие утилиты ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad2(n) { return String(n).padStart(2, '0'); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function isoToDate(iso) {
    var p = iso.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function sym() {
    for (var i = 0; i < CURRENCIES.length; i++) {
      if (CURRENCIES[i].code === db.currency) return CURRENCIES[i].sym;
    }
    return '₽';
  }

  function num(n) {
    var v = Math.abs(n);
    try {
      return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(v);
    } catch (e) {
      return String(Math.round(v));
    }
  }

  function money(n) { return num(n) + ' ' + sym(); }

  function signedMoney(n) {
    if (n === 0) return '';
    return (n < 0 ? '−' : '+') + num(n) + ' ' + sym();
  }

  function catInfo(type, id) {
    var list = CATS[type] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return FALLBACK_CAT;
  }

  function monthItems() {
    return db.items.filter(function (it) { return it.date.slice(0, 7) === cur; });
  }

  /* ---------- хранилище ---------- */

  function normItem(it) {
    if (!it || typeof it !== 'object') return null;
    var amount = Number(it.amount);
    if (!isFinite(amount) || amount <= 0) return null;
    var type = it.type === 'income' ? 'income' : 'expense';
    var date = /^\d{4}-\d{2}-\d{2}$/.test(String(it.date)) ? String(it.date) : todayISO();
    var cat = typeof it.cat === 'string' && it.cat ? it.cat : (type === 'expense' ? 'other' : 'other-i');
    return {
      id: String(it.id || uid()),
      type: type,
      amount: Math.round(amount * 100) / 100,
      cat: cat,
      note: String(it.note || '').slice(0, 60),
      date: date,
      ts: Number(it.ts) || 0
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || !Array.isArray(d.items)) return;
      for (var i = 0; i < CURRENCIES.length; i++) {
        if (CURRENCIES[i].code === d.currency) db.currency = d.currency;
      }
      db.items = d.items.map(normItem).filter(Boolean);
    } catch (e) { /* повреждённые данные — начинаем с чистого листа */ }
  }

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(db));
    } catch (e) {
      toast('Не удалось сохранить — возможно, закончилось место');
    }
  }

  /* ---------- отрисовка ---------- */

  function renderLabels() {
    var p = cur.split('-');
    var label = MONTHS[Number(p[1]) - 1] + ' ' + p[0];
    $$('.mlabel').forEach(function (el) { el.textContent = label; });
  }

  function dayLabel(iso) {
    var t = todayISO();
    if (iso === t) return 'Сегодня';
    var y = new Date();
    y.setDate(y.getDate() - 1);
    var yISO = y.getFullYear() + '-' + pad2(y.getMonth() + 1) + '-' + pad2(y.getDate());
    if (iso === yISO) return 'Вчера';
    var d = isoToDate(iso);
    return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ', ' + WEEKDAYS[d.getDay()];
  }

  function renderList() {
    var items = monthItems();
    var inc = 0, exp = 0;
    items.forEach(function (it) {
      if (it.type === 'income') inc += it.amount; else exp += it.amount;
    });
    var bal = inc - exp;

    var balEl = $('#sum-balance');
    balEl.textContent = (bal < 0 ? '−' : '') + num(bal) + ' ' + sym();
    balEl.classList.toggle('neg', bal < 0);
    $('#sum-income').textContent = num(inc) + ' ' + sym();
    $('#sum-expense').textContent = num(exp) + ' ' + sym();

    var host = $('#tx-list');

    if (!items.length) {
      host.innerHTML =
        '<div class="empty">' +
          '<div class="empty-ic">🧾</div>' +
          '<div class="empty-t">Пока пусто</div>' +
          '<div class="empty-s">Нажми «+», чтобы добавить первый расход или доход</div>' +
        '</div>';
      return;
    }

    var sorted = items.slice().sort(function (a, b) {
      if (a.date === b.date) return (b.ts || 0) - (a.ts || 0);
      return a.date < b.date ? 1 : -1;
    });

    var groups = new Map();
    sorted.forEach(function (it) {
      if (!groups.has(it.date)) groups.set(it.date, []);
      groups.get(it.date).push(it);
    });

    var html = '';
    groups.forEach(function (arr, date) {
      var net = 0;
      arr.forEach(function (it) { net += it.type === 'income' ? it.amount : -it.amount; });

      html += '<div class="group-hdr"><span>' + dayLabel(date) + '</span>' +
              '<span class="gsum">' + signedMoney(net) + '</span></div>';
      html += '<div class="card tight">';

      arr.forEach(function (it) {
        var c = catInfo(it.type, it.cat);
        html += '<button class="tx" data-id="' + esc(it.id) + '">' +
          '<span class="ic" style="background:' + c.color + '26">' + c.emoji + '</span>' +
          '<span class="tx-main">' +
            '<span class="tx-name">' + esc(c.name) + '</span>' +
            (it.note ? '<span class="tx-note">' + esc(it.note) + '</span>' : '') +
          '</span>' +
          '<span class="tx-amt' + (it.type === 'income' ? ' inc' : '') + '">' +
            (it.type === 'income' ? '+' : '−') + num(it.amount) + ' ' + sym() +
          '</span>' +
        '</button>';
      });

      html += '</div>';
    });

    host.innerHTML = html;
  }

  function renderStats() {
    var items = monthItems().filter(function (it) { return it.type === statsType; });
    var total = 0;
    items.forEach(function (it) { total += it.amount; });

    $('#stats-cap').textContent = statsType === 'expense' ? 'Всего расходов' : 'Всего доходов';
    $('#stats-total').textContent = num(total) + ' ' + sym();

    var host = $('#stats-list');
    if (!items.length) {
      host.innerHTML =
        '<div class="empty">' +
          '<div class="empty-ic">📊</div>' +
          '<div class="empty-t">Нет данных</div>' +
          '<div class="empty-s">Добавь записи — здесь появится разбивка по категориям</div>' +
        '</div>';
      return;
    }

    var by = new Map();
    items.forEach(function (it) { by.set(it.cat, (by.get(it.cat) || 0) + it.amount); });

    var rows = Array.from(by.entries()).sort(function (a, b) { return b[1] - a[1]; });
    var max = rows[0][1];

    var html = '<div class="card tight">';
    rows.forEach(function (row) {
      var c = catInfo(statsType, row[0]);
      var sum = row[1];
      var pct = total ? Math.round((sum / total) * 100) : 0;
      var w = Math.max(5, Math.round((sum / max) * 100));

      html += '<div class="stat">' +
        '<div class="stat-top">' +
          '<span class="stat-name"><span class="ic" style="background:' + c.color + '26">' + c.emoji + '</span>' +
          '<span>' + esc(c.name) + '</span></span>' +
          '<span class="stat-val">' + num(sum) + ' ' + sym() + '</span>' +
        '</div>' +
        '<div class="bar"><i style="width:' + w + '%;background:' + c.color + '"></i></div>' +
        '<div class="stat-sub">' + pct + '% от суммы</div>' +
      '</div>';
    });
    html += '</div>';

    host.innerHTML = html;
  }

  function renderSettings() {
    var sel = $('#currency');
    sel.innerHTML = CURRENCIES.map(function (c) {
      return '<option value="' + c.code + '"' + (c.code === db.currency ? ' selected' : '') + '>' +
             c.sym + ' — ' + c.code + '</option>';
    }).join('');

    $('#about-ver').textContent = 'v' + APP_VERSION;
    $('#about-count').textContent = 'Записей: ' + db.items.length;
  }

  function renderAll() {
    renderLabels();
    renderList();
    renderStats();
    renderSettings();
    $('#f-cur').textContent = sym();
  }

  /* ---------- шторка ---------- */

  function renderTypeSeg() {
    $$('#type-seg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.type === draft.type);
    });
  }

  function renderCats() {
    var list = CATS[draft.type];
    $('#f-cats').innerHTML = list.map(function (c) {
      return '<button class="cat' + (c.id === draft.cat ? ' on' : '') + '" data-cat="' + c.id + '">' +
        '<span class="ic" style="background:' + c.color + '26">' + c.emoji + '</span>' +
        '<span class="nm">' + esc(c.name) + '</span>' +
      '</button>';
    }).join('');
  }

  // Ширина поля суммы подстраивается под число, чтобы «0 ₽» стояло по центру
  var probeEl = null;

  function fitAmount() {
    var el = $('#f-amount');
    if (!probeEl) {
      probeEl = document.createElement('span');
      probeEl.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;' +
        'white-space:pre;font-weight:700;font-size:46px;letter-spacing:-0.03em;font-family:inherit';
      document.body.appendChild(probeEl);
    }
    probeEl.textContent = el.value || '0';
    var w = probeEl.getBoundingClientRect().width;
    el.style.width = Math.min(300, Math.max(28, Math.ceil(w) + 6)) + 'px';
  }

  function openSheet(id) {
    var item = null;
    if (id) {
      for (var i = 0; i < db.items.length; i++) {
        if (db.items[i].id === id) { item = db.items[i]; break; }
      }
    }

    editingId = item ? item.id : null;
    draft = item
      ? { type: item.type, cat: item.cat }
      : { type: 'expense', cat: 'food' };

    $('#f-amount').value = item ? String(item.amount).replace('.', ',') : '';
    $('#f-note').value = item ? item.note : '';
    $('#f-date').value = item ? item.date : todayISO();
    $('#f-del').hidden = !item;
    $('#f-cur').textContent = sym();

    renderTypeSeg();
    renderCats();
    fitAmount();

    $('#sheet').hidden = false;
    $('#f-amount').focus();
  }

  function closeSheet() {
    $('#sheet').hidden = true;
    editingId = null;
    $('#f-amount').blur();
  }

  function saveDraft() {
    var raw = $('#f-amount').value.replace(/\s/g, '').replace(',', '.');
    var amount = parseFloat(raw);

    if (!isFinite(amount) || amount <= 0) {
      toast('Введи сумму');
      $('#f-amount').focus();
      return;
    }

    var date = $('#f-date').value || todayISO();
    var item = {
      id: editingId || uid(),
      type: draft.type,
      amount: Math.round(amount * 100) / 100,
      cat: draft.cat,
      note: $('#f-note').value.trim(),
      date: date,
      ts: Date.now()
    };

    var wasEdit = !!editingId;

    if (wasEdit) {
      for (var i = 0; i < db.items.length; i++) {
        if (db.items[i].id === editingId) { db.items[i] = item; break; }
      }
    } else {
      db.items.push(item);
    }

    // показываем месяц, в который попала запись
    cur = date.slice(0, 7);

    persist();
    closeSheet();
    renderAll();
    toast(wasEdit ? 'Сохранено' : 'Добавлено');
  }

  function deleteEditing() {
    if (!editingId) return;
    if (!confirm('Удалить эту запись?')) return;

    var id = editingId;
    db.items = db.items.filter(function (x) { return x.id !== id; });
    persist();
    closeSheet();
    renderAll();
    toast('Удалено');
  }

  /* ---------- экспорт / импорт ---------- */

  async function exportData() {
    var data = JSON.stringify(db, null, 2);
    var name = 'koshelek-' + todayISO() + '.json';

    try {
      var file = new File([data], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Кошелёк — резервная копия' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }

    $('#m-text').value = data;
    $('#modal').hidden = false;
  }

  async function copyBackup() {
    var ta = $('#m-text');
    try {
      await navigator.clipboard.writeText(ta.value);
      toast('Скопировано');
    } catch (e) {
      ta.select();
      try { document.execCommand('copy'); toast('Скопировано'); }
      catch (e2) { toast('Выдели текст вручную'); }
    }
  }

  async function importFile(input) {
    var f = input.files && input.files[0];
    input.value = '';
    if (!f) return;

    try {
      var text = await f.text();
      var data = JSON.parse(text);
      var items = Array.isArray(data) ? data : data.items;
      if (!Array.isArray(items)) throw new Error('bad format');

      var clean = items.map(normItem).filter(Boolean);

      if (!confirm('Загрузить ' + clean.length + ' записей? Текущие записи будут заменены.')) return;

      db.items = clean;
      if (data && !Array.isArray(data)) {
        for (var i = 0; i < CURRENCIES.length; i++) {
          if (CURRENCIES[i].code === data.currency) db.currency = data.currency;
        }
      }

      persist();
      renderAll();
      toast('Загружено: ' + clean.length);
    } catch (e) {
      toast('Не получилось прочитать файл');
    }
  }

  /* ---------- прочее ---------- */

  var toastTimer = null;

  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.hidden = true; }, 240);
    }, 1900);
  }

  function shiftMonth(delta) {
    var p = cur.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1 + delta, 1);
    cur = d.getFullYear() + '-' + pad2(d.getMonth() + 1);
    renderAll();
  }

  function switchView(v) {
    $$('.view').forEach(function (s) {
      s.classList.toggle('active', s.id === 'view-' + v);
    });
    $$('#tabbar button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.view === v);
    });
    $('#fab').classList.toggle('hide', v !== 'list');
  }

  /* ---------- события ---------- */

  function bind() {
    document.addEventListener('click', function (e) {
      var t = e.target;

      var m = t.closest('[data-m]');
      if (m) { shiftMonth(Number(m.dataset.m)); return; }

      var todayBtn = t.closest('[data-today]');
      if (todayBtn && !m) { cur = todayISO().slice(0, 7); renderAll(); return; }

      var tab = t.closest('#tabbar button');
      if (tab) { switchView(tab.dataset.view); return; }

      var tx = t.closest('.tx');
      if (tx) { openSheet(tx.dataset.id); return; }

      var cat = t.closest('[data-cat]');
      if (cat) {
        draft.cat = cat.dataset.cat;
        renderCats();
        return;
      }

      if (t.closest('[data-close]')) { closeSheet(); return; }
      if (t.closest('[data-close-modal]')) { $('#modal').hidden = true; return; }
    });

    $('#fab').addEventListener('click', function () { openSheet(null); });

    $('#type-seg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-type]');
      if (!b) return;
      draft.type = b.dataset.type;
      draft.cat = CATS[draft.type][0].id;
      renderTypeSeg();
      renderCats();
    });

    $('#stats-seg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]');
      if (!b) return;
      statsType = b.dataset.t;
      $$('#stats-seg button').forEach(function (x) {
        x.classList.toggle('on', x.dataset.t === statsType);
      });
      renderStats();
    });

    $('#f-amount').addEventListener('input', function (e) {
      var v = e.target.value.replace(/[^\d.,]/g, '').replace(/,/g, '.');
      var i = v.indexOf('.');
      if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
      v = v.replace(/^0+(?=\d)/, '');
      if (v !== e.target.value) e.target.value = v;
      fitAmount();
    });

    $('#f-save').addEventListener('click', saveDraft);
    $('#f-del').addEventListener('click', deleteEditing);

    $('#f-amount').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); saveDraft(); }
    });

    $('#currency').addEventListener('change', function (e) {
      db.currency = e.target.value;
      persist();
      renderAll();
    });

    $('#export').addEventListener('click', exportData);
    $('#import').addEventListener('click', function () { $('#import-file').click(); });
    $('#import-file').addEventListener('change', function (e) { importFile(e.target); });

    $('#clear').addEventListener('click', function () {
      if (!db.items.length) { toast('И так пусто'); return; }
      if (!confirm('Удалить ВСЕ записи? Это нельзя отменить.')) return;
      db.items = [];
      persist();
      renderAll();
      toast('Все записи удалены');
    });

    $('#m-copy').addEventListener('click', copyBackup);
  }

  /* ---------- старт ---------- */

  function init() {
    cur = todayISO().slice(0, 7);
    load();
    bind();
    renderAll();
    switchView('list');

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* офлайн не критичен */ });
      });
    }
  }

  init();
})();
