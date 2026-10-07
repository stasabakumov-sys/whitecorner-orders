# Run with Windows PowerShell 5.1, -NoProfile -ExecutionPolicy RemoteSigned.
# Compiles the production launcher but runs only a mock script, never the station.
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -ne 'Desktop'){throw 'Run with Windows PowerShell 5.1.'}
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('White Corner launcher smoke '+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$launcher=Join-Path $testRoot 'station-launcher.exe'
Add-Type -Path (Join-Path $PSScriptRoot 'station-launcher.cs') -OutputAssembly $launcher -OutputType WindowsApplication
@'
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ConsoleProbe { [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); }'
@{console=[ConsoleProbe]::GetConsoleWindow().ToInt64()} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'probe.json')
Start-Sleep -Seconds 2
exit 23
'@ | Set-Content -LiteralPath (Join-Path $testRoot 'run-background.ps1')
$child=Start-Process -FilePath $launcher -WindowStyle Hidden -PassThru
$probePath=Join-Path $testRoot 'probe.json'
$deadline=(Get-Date).AddSeconds(20)
while(-not (Test-Path -LiteralPath $probePath)){
 if($child.HasExited -or (Get-Date) -gt $deadline){throw 'Mock process failed to report console state.'}
 Start-Sleep -Milliseconds 100
}
$probe=Get-Content -LiteralPath $probePath -Raw | ConvertFrom-Json
if($probe.console -ne 0){throw 'Background PowerShell allocated a console.'}
$child.WaitForExit();$child.Refresh()
if($child.ExitCode -ne 23){throw ('Launcher lost exit code: '+$child.ExitCode)}
Write-Output 'PASS: no console, paths with spaces, exit code preserved. No Hub or laser connection.'
