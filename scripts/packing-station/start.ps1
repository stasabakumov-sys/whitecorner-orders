param(
 [Parameter(Mandatory=$true)][string]$ControllerIp,
 [string]$StationName='Packing laptop'
)

if (-not $env:HUB_SUPABASE_URL -or -not $env:HUB_SUPABASE_ANON_KEY) {
 throw 'Set HUB_SUPABASE_URL and HUB_SUPABASE_ANON_KEY on this laptop before starting the station.'
}
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
