param([switch]$Build)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path -LiteralPath '.env')) {
    $cinemaRandom = New-Object byte[] 24
    $cinemaRng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $cinemaRng.GetBytes($cinemaRandom) } finally { $cinemaRng.Dispose() }
    $cinemaPassword = [Convert]::ToBase64String($cinemaRandom)
    @('APP_PORT=8090', 'LAN_BIND=0.0.0.0', 'APP_IMAGE=ghcr.io/hattimon/cinema-hub:1.3.26', "INITIAL_ADMIN_PASSWORD=$cinemaPassword", 'COOKIE_SECURE=false', 'PUBLIC_ORIGIN=') |
        Set-Content -LiteralPath '.env' -Encoding ascii
}

function Invoke-CinemaDocker([string[]]$DockerArguments) {
    & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker failed: docker $($DockerArguments -join ' ') (exit $LASTEXITCODE)" }
}

function Set-CinemaPublishedImage([string]$Image) {
    $envFile = Join-Path $PSScriptRoot '.env'
    $original = [IO.File]::ReadAllText($envFile)
    if ([regex]::IsMatch($original, '(?m)^APP_IMAGE=')) {
        $updated = [regex]::Replace($original, '(?m)^APP_IMAGE=[^\r\n]*', "APP_IMAGE=$Image")
    } else {
        $newline = if ($original.Contains("`r`n")) { "`r`n" } else { "`n" }
        $updated = $original.TrimEnd("`r", "`n") + $newline + "APP_IMAGE=$Image" + $newline
    }
    if ($updated -eq $original) { return }
    $backup = "$envFile.backup-$(Get-Date -Format 'yyyyMMddTHHmmss')"
    $temporary = "$envFile.new-$([guid]::NewGuid().ToString('N'))"
    try {
        [IO.File]::WriteAllText($temporary, $updated, [Text.UTF8Encoding]::new($false))
        # Available in both Windows PowerShell 5.1 and PowerShell 7.
        [IO.File]::Replace($temporary, $envFile, $backup)
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
    Write-Output "Image tag updated in .env; previous configuration: $backup"
}

if ($Build) {
    # Never overwrite the published GHCR tag with an unverified local build.
    $cinemaVersion = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
    if ($cinemaVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid Cinema Hub version.' }
    $previousImage = [Environment]::GetEnvironmentVariable('APP_IMAGE', 'Process')
    try {
        $env:APP_IMAGE = "cinema-hub:local-$cinemaVersion"
        Invoke-CinemaDocker -DockerArguments @('compose', 'build', 'cinema')
        Invoke-CinemaDocker -DockerArguments @('compose', 'up', '-d', '--no-build', '--no-deps', '--pull', 'never', '--wait', 'cinema')
        Write-Output "Cinema Hub built locally as $env:APP_IMAGE. DCC updater requires a published GHCR image."
    } finally {
        [Environment]::SetEnvironmentVariable('APP_IMAGE', $previousImage, 'Process')
    }
} else {
    # Pull must succeed before Compose can update the running service.
    # An unpublished version fails without silently building a local image.
    $previousImage = [Environment]::GetEnvironmentVariable('APP_IMAGE', 'Process')
    $publishedImage = 'ghcr.io/hattimon/cinema-hub:1.3.26'
    try {
        $env:APP_IMAGE = $publishedImage
        Invoke-CinemaDocker -DockerArguments @('compose', 'pull', 'cinema')
        Invoke-CinemaDocker -DockerArguments @('compose', 'up', '-d', '--no-build', '--no-deps', '--pull', 'never', '--wait', 'cinema')
        Set-CinemaPublishedImage -Image $publishedImage
    } finally {
        [Environment]::SetEnvironmentVariable('APP_IMAGE', $previousImage, 'Process')
    }
}

Write-Output 'Cinema Hub: http://localhost:8090/ . Initial admin password is in your local .env file.'
Invoke-CinemaDocker -DockerArguments @('compose', 'ps', 'cinema')
