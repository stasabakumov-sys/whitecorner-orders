param([string]$StationRoot=(Join-Path $env:LOCALAPPDATA 'WhiteCorner\PackingStation'))
$ErrorActionPreference='Stop'
$env:PSModulePath=(Join-Path $PSHOME 'Modules')+';'+$env:PSModulePath
$resolvedRoot=(Resolve-Path -LiteralPath $StationRoot).Path
foreach($file in @('run-background.ps1','supervisor.mjs','station.mjs','worker-runtime.mjs','hub-client.mjs','config.json','credential.xml')){
 if(-not (Test-Path -LiteralPath (Join-Path $resolvedRoot $file) -PathType Leaf)){throw ('Station file missing: '+$file)}
}
$powershellPath=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments='-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -WindowStyle Hidden -File "'+(Join-Path $resolvedRoot 'run-background.ps1')+'"'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$action=New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments -WorkingDirectory $resolvedRoot
$logon=New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$recovery=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal=New-ScheduledTaskPrincipal -UserId $identity.User.Value -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'White Corner Packing Station' -Action $action -Trigger @($logon,$recovery) -Principal $principal -Settings $settings -Description 'Recover the White Corner cutting station at sign-in and after a stopped launcher. File uploads only; cutting stays manual.' -Force | Out-Null
# Replace the older sign-in-only shortcut after the recovery task is confirmed.
$shortcutPath=Join-Path ([Environment]::GetFolderPath('Startup')) 'White Corner Packing Station.lnk'
if(Test-Path -LiteralPath $shortcutPath){Remove-Item -LiteralPath $shortcutPath}
Write-Output 'Station recovery registered for the current Windows user. No password is stored in Task Scheduler.'
