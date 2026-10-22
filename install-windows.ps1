param([switch]$Build)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
if(-not (Test-Path -LiteralPath '.env')){
    $cinemaRandom=New-Object byte[] 24
    $cinemaRng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try{$cinemaRng.GetBytes($cinemaRandom)}finally{$cinemaRng.Dispose()}
    $cinemaPassword=[Convert]::ToBase64String($cinemaRandom)
    @("APP_PORT=8090","LAN_BIND=0.0.0.0","APP_IMAGE=ghcr.io/hattimon/cinema-hub:1.3.9","INITIAL_ADMIN_PASSWORD=$cinemaPassword","COOKIE_SECURE=false","PUBLIC_ORIGIN=") | Set-Content -LiteralPath '.env' -Encoding ascii
}
$cinemaArguments=@('compose','up','-d')
if($Build){$cinemaArguments+='--build'}
& docker @cinemaArguments
if($LASTEXITCODE -ne 0){throw 'Cinema Hub installation failed.'}
Write-Output 'Cinema Hub: http://localhost:8090/ . Initial admin password is in your local .env file.'
docker compose ps cinema
