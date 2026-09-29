param(
 [Parameter(Mandatory=$true)][string]$ControllerIp,
 [string]$StationName='Packing laptop'
)

# The repository contains only public frontend connection settings here.
# Never read a service-role key or persist the operator's password.
if (-not $env:HUB_SUPABASE_URL -or -not $env:HUB_SUPABASE_ANON_KEY) {
 $configPath=Join-Path $PSScriptRoot '../../angular-app/src/environments/environment.ts'
 if(Test-Path -LiteralPath $configPath){
  $publicConfig=Get-Content -LiteralPath $configPath -Raw
  if(-not $env:HUB_SUPABASE_URL -and $publicConfig -match "supabaseUrl:\s*'([^']+)'"){$env:HUB_SUPABASE_URL=$Matches[1]}
  if(-not $env:HUB_SUPABASE_ANON_KEY -and $publicConfig -match "supabasePublishableKey:\s*'([^']+)'"){$env:HUB_SUPABASE_ANON_KEY=$Matches[1]}
 }
 if(-not $env:HUB_SUPABASE_URL -or -not $env:HUB_SUPABASE_ANON_KEY){
  throw 'Set HUB_SUPABASE_URL and HUB_SUPABASE_ANON_KEY on this laptop before starting the station.'
 }
}
Write-Host "Packing station -> laser $ControllerIp. Files only; cutting starts manually at the machine."
Write-Host 'Keep this window open. Close RDWorks before loading files. Stop with Ctrl+C.'
$env:HUB_LASER_IP=$ControllerIp
$env:HUB_STATION_NAME=$StationName
$env:HUB_STATION_EMAIL=Read-Host 'Manager email'
$securePassword=Read-Host 'Manager password' -AsSecureString
$passwordPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
 $env:HUB_STATION_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
 node (Join-Path $PSScriptRoot 'station.mjs') --send
} finally {
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
 Remove-Item Env:HUB_STATION_PASSWORD -ErrorAction SilentlyContinue
 Remove-Item Env:HUB_STATION_EMAIL -ErrorAction SilentlyContinue
}
