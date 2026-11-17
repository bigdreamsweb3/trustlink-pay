$ErrorActionPreference="Stop"
throw "Automatic Windows setup is disabled until a reviewed, fully pinned Python lock with artifact hashes and an enforcing installer are available. Existing environments are unchanged."
$root=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$venv=Join-Path $root ".venv"
$python=Join-Path $venv "Scripts\python.exe"
if(-not (Get-Command py -ErrorAction SilentlyContinue)){throw "Install Python for Windows with the py launcher first."}
if(-not (Test-Path $python)){& py -m venv $venv}
# The former unpinned pip installation is intentionally removed. Restore setup
# only after routing dependency installation through the reviewed lock guard.
& npm.cmd install --save-dev pm2
New-Item -ItemType Directory -Force -Path (Join-Path $root ".logs")|Out-Null
Write-Host "Setup complete. Run: npm run tsn:start"
