# Рендер скриншотов приложения через headless Edge (только для разработки)
# Запуск: powershell -ExecutionPolicy Bypass -File tools/shots.ps1
$ErrorActionPreference = 'Continue'

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$py   = 'C:\Users\gjjdj\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$root = Split-Path -Parent $PSScriptRoot
$prof = Join-Path $env:TEMP 'edge-wallet-prof'
$out  = Join-Path $root '_shots'
New-Item -ItemType Directory -Force -Path $out | Out-Null
Set-Location $root

# временный двойник index.html с хуками для скриншотов
$html = Get-Content 'index.html' -Raw -Encoding UTF8
$inject = @'
<script>
var v = new URLSearchParams(location.search).get('v');
addEventListener('load', function () {
  if (v === 'light') {
    var s = document.createElement('style');
    s.textContent = ':root{--bg:#f2f2f7;--bg-blur:rgba(242,242,247,.86);--card:#fff;--field:#f2f2f7;--text:#000;--text2:#8e8e93;--sep:rgba(60,60,67,.14);--accent:#007aff;--green:#34c759;--red:#ff3b30;--seg-bg:rgba(118,118,128,.12);--shadow:0 1px 2px rgba(0,0,0,.05)}';
    document.head.appendChild(s);
  }
  setTimeout(function () {
    if (v === 'sheet') document.getElementById('fab').click();
    if (v === 'light') document.getElementById('fab').click();
    if (v === 'stats') document.querySelector('#tabbar button[data-view="stats"]').click();
    if (v === 'edit') document.querySelector('.tx').click();
    if (v === 'settings') document.querySelector('#tabbar button[data-view="settings"]').click();
  }, 250);
});
</script>
</body>
'@
($html -replace '</body>', $inject) | Set-Content '_preview.html' -Encoding utf8

$common = @('--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--hide-scrollbars',"--user-data-dir=$prof")

& $edge @common '--virtual-time-budget=3000' 'http://127.0.0.1:8788/_seed.html' 2>$null | Out-Null
Start-Sleep -Milliseconds 300

$shots = @('list', 'stats', 'sheet', 'edit', 'settings', 'light')

foreach ($name in $shots) {
  $raw = Join-Path $out ("_raw_" + $name + ".png")
  $dst = Join-Path $out ($name + ".png")
  & $edge @common '--force-device-scale-factor=2' '--window-size=900,1200' '--virtual-time-budget=4000' "--screenshot=$raw" ("http://127.0.0.1:8788/_frame.html?v=" + $name) 2>$null | Out-Null
  if (Test-Path $raw) {
    & $py 'tools\crop-shot.py' $raw $dst
    "ok: {0}" -f $name
  } else {
    "FAIL: " + $name
  }
}
