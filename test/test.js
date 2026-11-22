/* Автотест логики «Кошелька» на jsdom. Запуск из web/_test: node test.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..', 'web');
const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(web, 'app.js'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true
});
const w = dom.window;
const d = w.document;

// заглушки
w.confirm = () => true;
Object.defineProperty(w.navigator, 'canShare', { value: () => false });
if (typeof w.Blob.prototype.text !== 'function') {
  w.Blob.prototype.text = function () {
    return this.arrayBuffer().then((b) => Buffer.from(b).toString('utf8'));
  };
}

w.eval(appJs);

let pass = 0, fail = 0;
function check(cond, name) {
  if (cond) { pass++; console.log('PASS — ' + name); }
  else { fail++; console.log('FAIL — ' + name); }
}
const txt = (sel) => (d.querySelector(sel) || { textContent: '' }).textContent;
// Intl.ru-RU использует неразрывные пробелы (U+00A0/U+202F) — убираем их при сравнении
const norm = (s) => String(s).replace(/[\u00A0\u202F\u0020\u2009]/g, '');
const click = (sel) => d.querySelector(sel).click();
const setAmount = (v) => {
  const amt = d.querySelector('#f-amount');
  amt.value = v;
  amt.dispatchEvent(new w.Event('input', { bubbles: true }));
};

(async () => {
  // 1. пусто
  check(txt('#sum-balance') === '0 ₽', 'начальный баланс 0 ₽');
  check(txt('#tx-list').includes('Пока пусто'), 'пустое состояние показано');

  // 2. расход
  click('#fab');
  setAmount('123.5');
  click('[data-cat="food"]');
  click('#f-save');
  check(txt('#tx-list').includes('Продукты') && txt('#tx-list').includes('−123,5'), 'расход 123,5 ₽ в списке');
  check(txt('#sum-expense') === '123,5 ₽', 'итог расходов 123,5 ₽');

  // 3. доход
  click('#fab');
  setAmount('1000');
  click('#type-seg [data-type="income"]');
  click('[data-cat="salary"]');
  click('#f-save');
  check(norm(txt('#sum-income')) === '1000₽', 'итог доходов 1 000 ₽');
  check(norm(txt('#sum-balance')) === '876,5₽', 'баланс 876,5 ₽');

  // 4. статистика
  click('#tabbar [data-view="stats"]');
  check(d.querySelectorAll('#stats-list .stat').length === 1 && txt('#stats-total') === '123,5 ₽', 'статистика: 1 категория расходов');
  click('#stats-seg [data-t="income"]');
  check(norm(txt('#stats-total')) === '1000₽', 'статистика: доходы 1 000 ₽');

  // 5. редактирование
  click('#tabbar [data-view="list"]');
  click('#tx-list .tx');
  setAmount('2000');
  click('#f-save');
  check(norm(txt('#sum-balance')) === '1876,5₽', 'доход изменён на 2 000 → баланс 1 876,5 ₽');

  // 6. удаление
  click('#tx-list .tx');
  click('#f-del');
  check(txt('#sum-balance') === '−123,5 ₽' && d.querySelectorAll('#tx-list .tx').length === 1, 'доход удалён, остался расход');

  // 7. экспорт
  click('#tabbar [data-view="settings"]');
  click('#export');
  const json = d.querySelector('#m-text').value;
  check(json.includes('"currency": "RUB"') && json.includes('123.5'), 'экспорт содержит JSON с записями');
  click('[data-close-modal="1"]');

  // 8. импорт
  const backup = JSON.stringify({
    v: 1, currency: 'RUB',
    items: [{ id: 'x1', type: 'expense', amount: 42, cat: 'cafe', note: 'тест', date: '2026-11-01', ts: 1 }]
  });
  const inp = d.querySelector('#import-file');
  const fakeFile = new w.File([backup], 'b.json', { type: 'application/json' });
  const flist = { 0: fakeFile, length: 1, item: (i) => (i === 0 ? fakeFile : null) };
  Object.defineProperty(inp, 'files', { value: flist, configurable: true });
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
  check(txt('#about-count') === 'Записей: 1', 'импорт файла (1 запись)');

  // 9. валюта
  const sel = d.querySelector('#currency');
  sel.value = 'USD';
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  check(txt('#sum-expense').includes('$'), 'смена валюты на $');

  // 10. месяцы
  click('#tabbar [data-view="list"]');
  click('[data-m="1"]');
  check(txt('.mlabel').includes('Декабрь'), 'переход на следующий месяц');
  click('[data-m="-1"]');
  click('[data-today="1"]');
  check(txt('.mlabel').includes('Ноябрь'), 'возврат к текущему месяцу');

  console.log('\nИТОГ: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
