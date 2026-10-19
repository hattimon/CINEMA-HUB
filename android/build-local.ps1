param([string[]]$Tasks = @(':app:assembleRelease', ':app:lintRelease'))
$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$toolchain = [IO.Path]::GetFullPath((Join-Path $project '..\..\.toolchain'))
$jdk = Get-ChildItem -LiteralPath (Join-Path $toolchain 'jdk') -Directory | Select-Object -First 1
if (-not $jdk) { throw 'Existing Java 17 toolchain was not found.' }
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = Join-Path $toolchain 'sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = Join-Path $toolchain 'android-user'
$env:GRADLE_USER_HOME = Join-Path $toolchain 'gradle-home'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$testClasses = Join-Path $project 'app\build\client-test-classes'
New-Item -ItemType Directory -Path $testClasses -Force | Out-Null
& "$env:JAVA_HOME\bin\javac.exe" -d $testClasses (Join-Path $project 'app\src\main\java\pl\cinemahub\tv\ServerAddress.java') (Join-Path $project 'tests\ServerAddressTest.java')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& "$env:JAVA_HOME\bin\java.exe" -cp $testClasses pl.cinemahub.tv.ServerAddressTest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& "$env:JAVA_HOME\bin\javac.exe" -d $testClasses (Join-Path $project 'app\src\main\java\pl\cinemahub\tv\PlaybackControls.java') (Join-Path $project 'tests\PlaybackControlsTest.java')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& "$env:JAVA_HOME\bin\java.exe" -cp $testClasses pl.cinemahub.tv.PlaybackControlsTest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& "$env:JAVA_HOME\bin\javac.exe" -d $testClasses (Join-Path $project 'app\src\main\java\pl\cinemahub\tv\RemoteNavigation.java') (Join-Path $project 'tests\RemoteNavigationTest.java')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& "$env:JAVA_HOME\bin\java.exe" -cp $testClasses pl.cinemahub.tv.RemoteNavigationTest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& "$env:JAVA_HOME\bin\javac.exe" -d $testClasses (Join-Path $project 'app\src\main\java\pl\cinemahub\tv\AppVersion.java') (Join-Path $project 'tests\AppVersionTest.java')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& "$env:JAVA_HOME\bin\java.exe" -cp $testClasses pl.cinemahub.tv.AppVersionTest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Push-Location $project
try {
    & (Join-Path $toolchain 'gradle\gradle-8.9\bin\gradle.bat') @Tasks --no-daemon
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $apk = Join-Path $project 'app\build\outputs\apk\release\app-release.apk'
    if (Test-Path -LiteralPath $apk) {
        & (Join-Path $env:ANDROID_HOME 'build-tools\35.0.0\apksigner.bat') verify $apk
        if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
        $release = Join-Path $project '..\releases'
        New-Item -ItemType Directory -Path $release -Force | Out-Null
        $target = Join-Path $release 'CinemaHub-AndroidTV-v1.3.5.apk'
        Copy-Item -LiteralPath $apk -Destination $target -Force
        Get-FileHash -LiteralPath $target -Algorithm SHA256
    }
} finally { Pop-Location }
