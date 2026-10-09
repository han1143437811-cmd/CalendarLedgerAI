param([switch]$NoRecognitionFixture)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$toolsRoot = Join-Path $projectRoot 'build-tools'
$androidJar = (Get-ChildItem -LiteralPath (Join-Path $toolsRoot 'sdk') -Filter android.jar -Recurse | Select-Object -First 1).FullName
$aapt2 = (Get-ChildItem -LiteralPath (Join-Path $toolsRoot 'sdk') -Filter aapt2.exe -Recurse | Select-Object -First 1).FullName
$zipalign = (Get-ChildItem -LiteralPath (Join-Path $toolsRoot 'sdk') -Filter zipalign.exe -Recurse | Select-Object -First 1).FullName
$d8Jar = (Get-ChildItem -LiteralPath (Join-Path $toolsRoot 'sdk') -Filter d8.jar -Recurse | Select-Object -First 1).FullName
$signerJar = (Get-ChildItem -LiteralPath (Join-Path $toolsRoot 'sdk') -Filter apksigner.jar -Recurse | Select-Object -First 1).FullName
$testJavaHome = 'F:\Java\jdk-21.0.10'
$testDirectory = Join-Path ([IO.Path]::GetTempPath()) ('calendarledger-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $testDirectory 'classes'),(Join-Path $testDirectory 'dex') -Force | Out-Null
$manifest = @'
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="org.calendarledger.preview.test" android:versionCode="1" android:versionName="1">
  <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="35"/><uses-permission android:name="android.permission.RECORD_AUDIO"/>
  <application android:debuggable="true" android:label="Calendar Ledger runtime test"><service android:name=".FixtureRecognitionService" android:exported="true" android:permission="android.permission.BIND_SPEECH_RECOGNITION_SERVICE"><intent-filter><action android:name="android.speech.RecognitionService"/></intent-filter></service></application>
  <instrumentation android:name=".OfflineStartupTest" android:targetPackage="org.calendarledger.preview"/>
  <instrumentation android:name=".VoiceRuntimeTest" android:targetPackage="org.calendarledger.preview"/>
</manifest>
'@
if ($NoRecognitionFixture) { $manifest = $manifest.Replace('android:name=".FixtureRecognitionService"','android:name=".FixtureRecognitionService" android:enabled="false"') }
[IO.File]::WriteAllText((Join-Path $testDirectory 'AndroidManifest.xml'),$manifest,[Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath $androidJar -Destination (Join-Path $testDirectory 'android.jar')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tests\OfflineStartupTest.java'),(Join-Path $PSScriptRoot 'tests\FixtureRecognitionService.java') -Destination $testDirectory
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tests\VoiceRuntimeTest.java') -Destination $testDirectory
$androidJar = Join-Path $testDirectory 'android.jar'
function Invoke-TestTool { param([string]$Executable,[string[]]$ToolArguments) & $Executable @ToolArguments; if ($LASTEXITCODE -ne 0) { throw "Tool failed ($LASTEXITCODE): $Executable" } }
$unsigned = Join-Path $testDirectory 'unsigned.apk'
Invoke-TestTool $aapt2 @('link','-o',$unsigned,'-I',$androidJar,'--manifest',(Join-Path $testDirectory 'AndroidManifest.xml'))
Invoke-TestTool (Join-Path $testJavaHome 'bin\javac.exe') @('-encoding','UTF-8','--release','8','-classpath',$androidJar,'-d',(Join-Path $testDirectory 'classes'),(Join-Path $testDirectory 'OfflineStartupTest.java'),(Join-Path $testDirectory 'FixtureRecognitionService.java'),(Join-Path $testDirectory 'VoiceRuntimeTest.java'))
Invoke-TestTool (Join-Path $testJavaHome 'bin\jar.exe') @('--create','--file',(Join-Path $testDirectory 'classes.jar'),'-C',(Join-Path $testDirectory 'classes'),'.')
Invoke-TestTool (Join-Path $testJavaHome 'bin\java.exe') @('-cp',$d8Jar,'com.android.tools.r8.D8','--lib',$androidJar,'--min-api','26','--output',(Join-Path $testDirectory 'dex'),(Join-Path $testDirectory 'classes.jar'))
Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($unsigned,[IO.Compression.ZipArchiveMode]::Update)
try { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $testDirectory 'dex\classes.dex'),'classes.dex',[IO.Compression.CompressionLevel]::Optimal) | Out-Null } finally { $zip.Dispose() }
$aligned = Join-Path $testDirectory 'aligned.apk'
Invoke-TestTool $zipalign @('-p','-f','4',$unsigned,$aligned)
$signed = Join-Path $testDirectory 'runtime-test.apk'
Invoke-TestTool (Join-Path $testJavaHome 'bin\java.exe') @('-jar',$signerJar,'sign','--ks',(Join-Path $toolsRoot 'signing\preview.p12'),'--ks-key-alias','calendar-ledger-preview','--ks-pass',('file:'+(Join-Path $toolsRoot 'signing\password.txt')),'--out',$signed,$aligned)
$testName = if ($NoRecognitionFixture) { 'runtime-test-no-system-speech.apk' } else { 'runtime-test.apk' }
$testOutput = Join-Path $PSScriptRoot ('build\'+$testName)
Copy-Item -LiteralPath $signed -Destination $testOutput -Force
Write-Output "RUNTIME_TEST_APK=$testOutput"
