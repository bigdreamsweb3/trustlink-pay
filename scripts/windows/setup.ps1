$ErrorActionPreference="Stop"
$root=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$venv=Join-Path $root ".venv"
$python=Join-Path $venv "Scripts\python.exe"
if(-not (Get-Command py -ErrorAction SilentlyContinue)){throw "Install Python for Windows with the py launcher first."}
if(-not (Test-Path $python)){& py -m venv $venv}
& $python -m pip install -r (Join-Path $root "tsn-protocol\tsn-mempool-backend\requirements.txt")
& npm.cmd install --save-dev pm2
New-Item -ItemType Directory -Force -Path (Join-Path $root ".logs")|Out-Null
Write-Host "Setup complete. Run: npm run tsn:start"
