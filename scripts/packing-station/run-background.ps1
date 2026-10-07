param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$env:PSModulePath=(Join-Path $PSHOME 'Modules')+';'+$env:PSModulePath
$stationRoot=$PSScriptRoot
$mutex=New-Object System.Threading.Mutex($false,'Local\WhiteCornerPackingStation')
$ownsMutex=$false
try {
 try {$ownsMutex=$mutex.WaitOne(0)} catch [System.Threading.AbandonedMutexException] {$ownsMutex=$true}
 if(-not $ownsMutex){exit 0}
 $config=Get-Content -LiteralPath (Join-Path $stationRoot 'config.json') -Raw | ConvertFrom-Json
 if(-not (Test-Path -LiteralPath $config.nodePath)){throw 'Node.js is missing. Run station setup again.'}
 $credential=Import-Clixml -LiteralPath (Join-Path $stationRoot 'credential.xml')
 if($credential -isnot [System.Management.Automation.PSCredential]){throw 'Station sign-in is missing. Run setup again.'}
 if($CheckOnly){Write-Output 'Configuration and Windows-protected sign-in are readable.'; exit 0}
 $env:HUB_SUPABASE_URL=$config.url
 $env:HUB_SUPABASE_ANON_KEY=$config.anonKey
 $env:HUB_LASER_IP=$config.controller
 $env:HUB_STATION_NAME=$config.stationName
 $env:HUB_STATION_EMAIL=$credential.UserName
 $env:HUB_STATION_PASSWORD=$credential.GetNetworkCredential().Password
 $log=Join-Path $stationRoot 'station.log'
 while($true){
  if((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 5MB){Move-Item -LiteralPath $log -Destination (Join-Path $stationRoot 'station.previous.log') -Force}
  Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Starting station; cutting remains manual."
  $stationProcess=Start-Process -FilePath $config.nodePath -ArgumentList ('"'+(Join-Path $stationRoot 'supervisor.mjs')+'"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stationRoot 'transfer.log') -RedirectStandardError (Join-Path $stationRoot 'errors.log')
  $stationProcess.WaitForExit()
  Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Station exited; restarting in 15 seconds."
  Start-Sleep -Seconds 15
 }
} catch {
 Add-Content -LiteralPath (Join-Path $stationRoot 'startup-error.log') -Value "$(Get-Date -Format o) Startup failed. Re-run station setup to check Node.js and saved sign-in."
 if($CheckOnly){throw}
} finally {
 Remove-Item Env:HUB_STATION_PASSWORD,Env:HUB_STATION_EMAIL -ErrorAction SilentlyContinue
 if($ownsMutex){$mutex.ReleaseMutex()}
 $mutex.Dispose()
}
