param([Parameter(Position=0,Mandatory=$true)][ValidateSet("start","stop","restart","delete","status","logs","doctor")][string]$Command,[Parameter(Position=1)][string]$Service)
$ErrorActionPreference="Stop"
$root=(Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ecosystem=Join-Path $root "ecosystem.config.cjs"
$core=@("trustlink-frontend","trustlink-backend","trustlink-rpc-gateway")
$managed=@("trustlink-frontend","trustlink-backend","trustlink-rpc-gateway","trustlink-mempool","trustlink-mempool-ui","trustlink-cranker")
if($Service -and $Service -notin @("frontend","backend","rpc-gateway","mempool","mempool-ui","cranker")){throw "Unknown service: $Service"}
$selected=if($Service){@("trustlink-"+$Service)}else{$core}
function Invoke-Pm2([string[]]$Arguments){ & npx.cmd --no-install pm2 @Arguments; if($LASTEXITCODE -ne 0){throw "PM2 command failed"} }
function Remove-Pm2Apps([string[]]$Apps){ foreach($app in $Apps){ & cmd.exe /d /s /c "npx.cmd --no-install pm2 delete $app >nul 2>&1" } }
switch($Command){
 "start" { New-Item -ItemType Directory -Force -Path (Join-Path $root ".logs")|Out-Null; Invoke-Pm2 @("start",$ecosystem,"--only",($selected -join ",")) }
 "stop" { foreach($app in $(if($Service){$selected}else{$managed})){ & cmd.exe /d /s /c "npx.cmd --no-install pm2 stop $app >nul 2>&1" } }
 "restart" { foreach($app in $selected){ Invoke-Pm2 @("restart",$app) } }
 "delete" { Remove-Pm2Apps $(if($Service){$selected}else{$managed}) }
 "status" { Invoke-Pm2 @("status") }
 "logs" { if($Service){Invoke-Pm2 @("logs",("trustlink-"+$Service),"--lines","100")}else{Invoke-Pm2 @("logs","--lines","100")} }
 "doctor" { foreach($tool in @("node","npm","python")){if(Get-Command $tool -ErrorAction SilentlyContinue){Write-Host "[PASS] $tool detected"}else{Write-Host "[FAIL] $tool missing"}} }
}
