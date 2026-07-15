param(
  [string]$Domain = "unimpressionable-overambitious-jessie.ngrok-free.dev",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

function Resolve-NgrokExecutable {
  $command = Get-Command ngrok.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $searchDirectories = @(
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links"),
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages")
  )

  $executable = Get-ChildItem $searchDirectories `
    -Recurse `
    -File `
    -Filter ngrok.exe `
    -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $executable) {
    throw "ngrok is not installed. Run: winget install --id Ngrok.Ngrok -e"
  }

  return $executable.FullName
}

function Assert-BackendIsListening {
  $listener = Get-NetTCPConnection `
    -LocalPort $Port `
    -State Listen `
    -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $listener) {
    throw "TrustLink backend is not listening on port $Port. Run: npm run tsn:start:backend"
  }
}

$ngrok = Resolve-NgrokExecutable

& $ngrok config check
if ($LASTEXITCODE -ne 0) {
  throw "ngrok configuration is invalid. Run: ngrok config add-authtoken YOUR_TOKEN"
}

Assert-BackendIsListening

$publicOrigin = "https://$Domain"
Write-Host "Opening TrustLink WhatsApp webhook tunnel"
Write-Host "Public origin: $publicOrigin"
Write-Host "Meta callback: $publicOrigin/api/webhooks/whatsapp"
Write-Host "Local backend: http://localhost:$Port"
Write-Host "Press Ctrl+C to close the tunnel."

& $ngrok http "--url=$Domain" $Port
if ($LASTEXITCODE -ne 0) {
  throw "ngrok tunnel stopped with exit code $LASTEXITCODE"
}
