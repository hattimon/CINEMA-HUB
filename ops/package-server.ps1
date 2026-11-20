param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = [string]$package.version
if ($version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') { throw "Invalid package version: $version" }
$apkEntry = "releases/CinemaHub-AndroidTV-v$version.apk"
$apk = Join-Path $root $apkEntry
if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) { throw "Missing release input: $apkEntry" }
$apkHash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
$out = Join-Path $root 'releases'
[void](New-Item -ItemType Directory -Path $out -Force)
$apkChecksum = "SHA256SUMS-AndroidTV-v$version.txt"
"$apkHash  CinemaHub-AndroidTV-v$version.apk" | Set-Content -LiteralPath (Join-Path $out $apkChecksum) -Encoding ascii

# Archive only explicit project inputs. Never recursively archive the workspace,
# which can contain user accounts, browser profiles, SQLite databases and secrets.
$rootFiles = @(
  '.dockerignore', '.env.example', '.github/workflows/container.yml',
  'CHANGELOG.md', 'README.md',
  'Dockerfile', 'Dockerfile.pi', 'Dockerfile.pi.dockerignore',
  'Dockerfile.pi.offline', 'Dockerfile.pi.offline.dockerignore',
  'Dockerfile.pi.rollback', 'Dockerfile.pi.rollback.dockerignore',
  'compose.yaml', 'compose.pi.yaml', 'index.html',
  'install-windows.ps1', 'install-raspberry-pi.sh',
  'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
  'docs/INSTALL.md', 'docs/ANDROID-TV.md', 'docs/SOURCES.md',
  "docs/AUDIT-$version.md", "docs/DCC-CATALOG-v$version.patch",
  "docs/RELEASE-$version.md",
  'ops/start.sh', 'ops/audit-stargate.mjs', 'ops/package-server.ps1',
  $apkEntry, "releases/$apkChecksum"
)
$directories = @('server', 'src', 'public', 'dist', 'tests')
$extensions = @('.mjs', '.mts', '.js', '.ts', '.tsx', '.py', '.css',
  '.html', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp',
  '.ico', '.woff', '.woff2', '.ttf', '.webmanifest', '.txt', '.vtt')
$paths = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)

foreach ($name in $rootFiles) {
  $full = Join-Path $root $name
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "Missing release input: $name" }
  [void]$paths.Add((Resolve-Path -LiteralPath $full).Path)
}
foreach ($name in $directories) {
  $directory = Join-Path $root $name
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) { throw "Missing release directory: $name" }
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Recurse -File) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing symbolic link: $($entry.FullName)" }
    if ($extensions -notcontains $entry.Extension.ToLowerInvariant()) { throw "Unexpected file type in $name : $($entry.FullName)" }
    [void]$paths.Add($entry.FullName)
  }
}

$filename = "CinemaHub-Server-v$version.zip"
$archive = Join-Path $out $filename
$temporaryArchive = "$archive.tmp"
if (Test-Path -LiteralPath $temporaryArchive) { Remove-Item -LiteralPath $temporaryArchive -Force }
$zip = [IO.Compression.ZipFile]::Open($temporaryArchive, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($full in ($paths | Sort-Object)) {
    $relative = $full.Substring($root.Length + 1).Replace('\', '/')
    if ($relative -match '(^|/)(\.private|\.env|node_modules|data|\.git)(/|$)' -or
        $relative -match '\.(db|sqlite|log|key|pem)$') { throw "Blocked private input: $relative" }
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $full, $relative, [IO.Compression.CompressionLevel]::Optimal)
  }
} finally { $zip.Dispose() }

$check = [IO.Compression.ZipFile]::OpenRead($temporaryArchive)
try {
  $entries = @($check.Entries | ForEach-Object FullName)
  foreach ($expected in @('server/stargate-identity.mjs','server/stargate-playlists.mjs',
      'server/playback-identity.mjs',
      'src/playlistProgress.ts','tests/stargate.test.mjs',
      'tests/playlist-migration.test.mjs','tests/playlist-journal.test.mjs',
      'tests/release-ci.test.mjs','.github/workflows/container.yml',
      $apkEntry, "releases/$apkChecksum")) {
    if ($entries -notcontains $expected) { throw "Missing critical release file: $expected" }
  }
  if ($entries.Count -ne $paths.Count) { throw "Unexpected archive entry count: $($entries.Count) vs $($paths.Count)" }
} finally { $check.Dispose() }
Move-Item -LiteralPath $temporaryArchive -Destination $archive -Force

$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = [ordered]@{
  version = $version
  status = 'local_prepared_unpublished'
  artifact = [ordered]@{ path = "releases/$filename"; bytes = (Get-Item $archive).Length; sha256 = $hash; entries = $paths.Count }
  image = [ordered]@{ repository = 'ghcr.io/hattimon/cinema-hub'; tag = $version; platforms = @('linux/amd64','linux/arm64'); published = $false }
  androidTvClient = [ordered]@{ version = $version; packagedInContainer = $true; hardwareVerified = $false; sha256 = $apkHash }
  audit = [ordered]@{ scope = 'archived_metadata_only'; episodes = 314; verifiedVideoFrames = 0; unavailable = @('SGA S01E09') }
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out "CinemaHub-v$version-manifest.json") -Encoding utf8
"$hash  $filename" | Set-Content -LiteralPath (Join-Path $out "SHA256SUMS-Server-v$version.txt") -Encoding ascii
Write-Output "Prepared $filename, $($paths.Count) entries, SHA256 $hash"
