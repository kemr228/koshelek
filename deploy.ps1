# Публикация приложения на GitHub Pages.
# Кладёт содержимое web/ в ветку gh-pages и пушит её.
# Токен берёт из $env:GH_TOKEN или из файла .ghtoken (в корне репо, в git не попадает).
#
# Запуск:  powershell -ExecutionPolicy Bypass -File deploy.ps1
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$repo = 'kemr228/koshelek'

$token = $env:GH_TOKEN
if (-not $token -and (Test-Path (Join-Path $root '.ghtoken'))) {
  $token = (Get-Content (Join-Path $root '.ghtoken') -Raw).Trim()
}
if (-not $token) {
  throw 'Нет токена. Задай $env:GH_TOKEN или положи токен в файл .ghtoken (нужен scope repo).'
}

$tmp = Join-Path $env:TEMP 'koshelek-pages'
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $tmp | Out-Null

git init -b gh-pages $tmp | Out-Null

foreach ($f in 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'sw.js', '.nojekyll') {
  Copy-Item (Join-Path $root "web\$f") $tmp -Force
}
Copy-Item -Recurse (Join-Path $root 'web\icons') $tmp -Force

git -C $tmp config user.name 'kemr228'
git -C $tmp config user.email '143332865+kemr228@users.noreply.github.com'
git -C $tmp add -A
git -C $tmp commit -m 'Deploy' --quiet
git -C $tmp push "https://kemr228:$token@github.com/$repo.git" gh-pages --force

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Готово: https://kemr228.github.io/koshelek/'
