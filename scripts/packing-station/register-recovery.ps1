param([string]$StationRoot=(Join-Path ([Environment]::GetFolderPath('UserProfile')) 'WhiteCorner\PackingStation'))
$ErrorActionPreference='Stop'
$env:PSModulePath=(Join-Path $PSHOME 'Modules')+';'+$env:PSModulePath
$resolvedRoot=(Resolve-Path -LiteralPath $StationRoot).Path
foreach($file in @('station-launcher.cs','run-background.ps1','supervisor.mjs','station.mjs','worker-runtime.mjs','hub-client.mjs','config.json','credential.xml')){
 if(-not (Test-Path -LiteralPath (Join-Path $resolvedRoot $file) -PathType Leaf)){throw ('Station file missing: '+$file)}
}
$launcherSource=Join-Path $resolvedRoot 'station-launcher.cs'
$launcherHash=(Get-FileHash -LiteralPath $launcherSource -Algorithm SHA256).Hash.Substring(0,16).ToLowerInvariant()
# Versioned filenames allow an upgrade while the previous launcher is still running.
$launcherPath=Join-Path $resolvedRoot ('station-launcher-'+$launcherHash+'.exe')
if(-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)){
 Add-Type -Path $launcherSource -OutputAssembly $launcherPath -OutputType WindowsApplication
}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
# Every station path is absolute or relative to PSScriptRoot/import.meta.url.
# Leave the Scheduler working directory unset so it can start in its own context.
$action=New-ScheduledTaskAction -Execute $launcherPath
$logon=New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$recovery=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal=New-ScheduledTaskPrincipal -UserId $identity.User.Value -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'White Corner Packing Station' -Action $action -Trigger @($logon,$recovery) -Principal $principal -Settings $settings -Description 'Recover the White Corner cutting station at sign-in and after a stopped launcher. File uploads only; cutting stays manual.' -Force | Out-Null
# Replace the older sign-in-only shortcut after the recovery task is confirmed.
$shortcutPath=Join-Path ([Environment]::GetFolderPath('Startup')) 'White Corner Packing Station.lnk'
if(Test-Path -LiteralPath $shortcutPath){Remove-Item -LiteralPath $shortcutPath}
Write-Output 'Station recovery registered for the current Windows user. No password is stored in Task Scheduler.'
