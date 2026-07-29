param([Parameter(Position=0,Mandatory=$true)][ValidateSet("start","stop","restart","delete","status","logs","doctor")][string]$Command,[Parameter(Position=1)][string]$Service)
$ErrorActionPreference="Stop"
$root=(Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ecosystem=Join-Path $root "ecosystem.config.cjs"
$node=(Get-Command node.exe -ErrorAction Stop).Source
$pm2Cli=Join-Path $root "node_modules\pm2\bin\pm2"
$core=@("trustlink-mempool","trustlink-rpc-gateway","trustlink-mempool-ui","trustlink-cranker")
$managed=@("trustlink-mempool","trustlink-backend","trustlink-rpc-gateway","trustlink-mempool-ui","trustlink-cranker")
if($Service -and $Service -notin @("backend","rpc-gateway","mempool","mempool-ui","cranker")){throw "Unknown service: $Service"}
if(!(Test-Path -LiteralPath $pm2Cli)){throw "Local PM2 is missing. Run: npm.cmd install"}
$selected=if($Service){@("trustlink-"+$Service)}else{$core}
function Start-Pm2([string[]]$Arguments){
 $process=Start-Process -FilePath $node -ArgumentList (@($pm2Cli)+$Arguments) -NoNewWindow -Wait -PassThru
 return $process.ExitCode
}
function Invoke-Pm2([string[]]$Arguments){
 $exitCode=Start-Pm2 $Arguments
 if($exitCode -ne 0){throw "PM2 command failed with exit code $exitCode"}
}
function Remove-Pm2Apps([string[]]$Apps){ foreach($app in $Apps){ [void](Start-Pm2 @("delete",$app)) } }
switch($Command){
 "start" { New-Item -ItemType Directory -Force -Path (Join-Path $root ".logs")|Out-Null; Invoke-Pm2 @("start",$ecosystem,"--only",($selected -join ",")) }
 "stop" { foreach($app in $(if($Service){$selected}else{$managed})){ [void](Start-Pm2 @("stop",$app)) } }
 "restart" { foreach($app in $selected){ Invoke-Pm2 @("restart",$app) } }
 "delete" { Remove-Pm2Apps $(if($Service){$selected}else{$managed}) }
 "status" { Invoke-Pm2 @("status") }
 "logs" { if($Service){Invoke-Pm2 @("logs",("trustlink-"+$Service),"--lines","100")}else{Invoke-Pm2 @("logs","--lines","100")} }
 "doctor" { foreach($tool in @("node","npm","python")){if(Get-Command $tool -ErrorAction SilentlyContinue){Write-Host "[PASS] $tool detected"}else{Write-Host "[FAIL] $tool missing"}} }
}
