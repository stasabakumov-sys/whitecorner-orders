param([string]$ControllerIp='192.168.1.100')
$ErrorActionPreference='Stop'
$env:PSModulePath=(Join-Path $PSHOME 'Modules')+';'+$env:PSModulePath
$installRoot=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'WhiteCorner\PackingStation'
$statusPath=Join-Path $installRoot 'setup-status.json'
function Set-SetupStatus([string]$state,[string]$message){
 @{state=$state;message=$message;time=(Get-Date -Format o)} | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
}
try {
 $parsedAddress=$null
 if(-not [Net.IPAddress]::TryParse($ControllerIp,[ref]$parsedAddress) -or $ControllerIp -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)'){throw 'A private controller IPv4 address is required.'}
 $nodePath=(Get-Command node.exe -ErrorAction Stop).Source
 $publicConfig=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../../angular-app/src/environments/environment.ts') -Raw
 if($publicConfig -notmatch "supabaseUrl:\s*'([^']+)'"){throw 'Public Hub URL was not found.'}
 $hubUrl=$Matches[1]
 if($publicConfig -notmatch "supabasePublishableKey:\s*'([^']+)'"){throw 'Public Hub key was not found.'}
 $hubKey=$Matches[1]
 New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
 # Restrict the local credential, executable scripts and configuration to this user and SYSTEM.
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $acl=New-Object Security.AccessControl.DirectorySecurity
 $acl.SetOwner($sid)
 $acl.SetAccessRuleProtection($true,$false)
 foreach($identity in @($sid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))){
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
 }
 Set-Acl -LiteralPath $installRoot -AclObject $acl
 Set-SetupStatus 'waiting_for_signin' 'Enter your Hub manager account in the Windows credential prompt.'
 Write-Host 'One-time setup: sign in with your Hub manager account.'
 Write-Host 'Windows will encrypt the saved password for your Windows account on this computer.'
 Write-Host 'The station will start in the background at sign-in and process Hub upload requests. Cutting stays manual.'
 $credential=Get-Credential -Message 'White Corner Hub manager sign-in for automatic Packing station'
 if(-not $credential){Set-SetupStatus 'cancelled' 'Setup cancelled. Autostart was not enabled.'; exit 0}
 $body=@{email=$credential.UserName;password=$credential.GetNetworkCredential().Password} | ConvertTo-Json -Compress
 try {
  $session=Invoke-RestMethod -Method Post -Uri "$hubUrl/auth/v1/token?grant_type=password" -Headers @{apikey=$hubKey} -ContentType 'application/json' -Body $body
  $headers=@{apikey=$hubKey;Authorization=('Bearer '+$session.access_token)}
  $members=Invoke-RestMethod -Uri "$hubUrl/rest/v1/wc_hub_members?select=role,active&user_id=eq.$($session.user.id)" -Headers $headers
  if(-not ($members | Where-Object {$_.role -eq 'manager' -and $_.active})){throw 'Manager access required.'}
 } catch {throw 'Hub sign-in or manager check failed. Check the account and connection, then run setup again.'}
 finally {$body=$null;$headers=$null;$session=$null}
 foreach($file in @('station.mjs','worker-runtime.mjs','ruida-udp.mjs','transfer-task.mjs','hub-client.mjs','supervisor.mjs','run-background.ps1','register-recovery.ps1','station-launcher.cs')){
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $installRoot $file) -Force
 }
 $credential | Export-Clixml -LiteralPath (Join-Path $installRoot 'credential.xml')
 $credential=$null
 @{url=$hubUrl;anonKey=$hubKey;controller=$ControllerIp;stationName='Packing laptop';nodePath=$nodePath} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $installRoot 'config.json') -Encoding UTF8
 $powershellPath=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
 & $powershellPath -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File (Join-Path $installRoot 'run-background.ps1') -CheckOnly
 if($LASTEXITCODE -ne 0){throw 'Saved station configuration could not be verified.'}
 & (Join-Path $installRoot 'register-recovery.ps1') -StationRoot $installRoot
 Start-ScheduledTask -TaskName 'White Corner Packing Station'
 Set-SetupStatus 'installed' 'Autostart enabled for this Windows user. Station started in the background.'
 Write-Host 'Done. Refresh Packing work in Hub. Close this setup window.' -ForegroundColor Green
} catch {
 if(Test-Path -LiteralPath $installRoot){Set-SetupStatus 'failed' $_.Exception.Message}
 Write-Host $_.Exception.Message -ForegroundColor Red
 Read-Host 'Press Enter to close'
 exit 1
}
