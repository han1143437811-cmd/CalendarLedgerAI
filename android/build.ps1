$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$toolsRoot = Join-Path $projectRoot 'build-tools'
$sdkRoot = Join-Path $toolsRoot 'sdk'
$androidJar = (Get-ChildItem -LiteralPath $sdkRoot -Filter android.jar -Recurse | Select-Object -First 1).FullName
$aapt2 = (Get-ChildItem -LiteralPath $sdkRoot -Filter aapt2.exe -Recurse | Select-Object -First 1).FullName
$zipalign = (Get-ChildItem -LiteralPath $sdkRoot -Filter zipalign.exe -Recurse | Select-Object -First 1).FullName
$d8Jar = (Get-ChildItem -LiteralPath $sdkRoot -Filter d8.jar -Recurse | Select-Object -First 1).FullName
$signerJar = (Get-ChildItem -LiteralPath $sdkRoot -Filter apksigner.jar -Recurse | Select-Object -First 1).FullName
$buildJavaHome = 'F:\Java\jdk-21.0.10'
if (-not $androidJar -or -not $aapt2) { throw 'Run build-tools/setup-android.ps1 first.' }
$voiceRoot = Join-Path $toolsRoot 'voice'
$voskJar = Join-Path $voiceRoot 'vosk-classes.jar'
$jnaJar = Join-Path $voiceRoot 'jna-classes.jar'
$speechModel = Join-Path $voiceRoot 'vosk-model-small-cn-0.22.zip'
if (-not (Test-Path -LiteralPath $voskJar) -or -not (Test-Path -LiteralPath $jnaJar) -or -not (Test-Path -LiteralPath $speechModel)) {
    & python (Join-Path $toolsRoot 'setup-voice.py')
    if ($LASTEXITCODE -ne 0) { throw 'Chinese speech dependencies could not be prepared.' }
}
# aapt2 on Windows cannot reliably read non-ASCII paths. Stage the build in an
# ASCII temporary directory; the project and delivered APK stay in the workspace.
$buildDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('calendarledger-build-' + [guid]::NewGuid().ToString('N'))
$assetDirectory = Join-Path $buildDirectory 'assets\web'
$classesDirectory = Join-Path $buildDirectory 'classes'
$generatedDirectory = Join-Path $buildDirectory 'generated'
$dexDirectory = Join-Path $buildDirectory 'dex'
$distributionDirectory = Join-Path $projectRoot 'dist'
[xml]$appManifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'AndroidManifest.xml') -Raw -Encoding UTF8
$appVersion = $appManifest.manifest.GetAttribute('versionName','http://schemas.android.com/apk/res/android')
$appVersionCode = $appManifest.manifest.GetAttribute('versionCode','http://schemas.android.com/apk/res/android')
foreach ($directory in @($assetDirectory,$classesDirectory,$generatedDirectory,$dexDirectory,$distributionDirectory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'res'),(Join-Path $PSScriptRoot 'src') -Destination $buildDirectory -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'AndroidManifest.xml') -Destination $buildDirectory
Copy-Item -LiteralPath $androidJar -Destination (Join-Path $buildDirectory 'android.jar')
$androidJar = Join-Path $buildDirectory 'android.jar'
Copy-Item -LiteralPath $voskJar,$jnaJar -Destination $buildDirectory
$voskJar = Join-Path $buildDirectory 'vosk-classes.jar'
$jnaJar = Join-Path $buildDirectory 'jna-classes.jar'
$speechAssets = Join-Path $buildDirectory 'assets\speech'
New-Item -ItemType Directory -Path $speechAssets -Force | Out-Null
Copy-Item -LiteralPath $speechModel -Destination $speechAssets
$assetNames = @('index.html','styles.css','icon.svg','app.mjs','core.mjs','demo.mjs','platform.mjs','weather-view.mjs','weather-icons.mjs','expense-allocation.mjs','ai-context.mjs','ai-agent.mjs','ai-memory-view.mjs','ai-controls.mjs','ai-options.mjs','ai-summary.mjs','corrections.mjs','corrections-view.mjs','chat-branches.mjs','chat-branches-view.mjs','api-providers.mjs','api-providers-view.mjs','web-tools.mjs','holiday-data.mjs','festivals.mjs','widget-navigation.mjs','chat-view.mjs','chat-stream.mjs','chat-markdown.mjs','multimodal.mjs','THIRD_PARTY_NOTICES.txt')
foreach ($assetName in $assetNames) { Copy-Item -LiteralPath (Join-Path (Join-Path $projectRoot 'prototype') $assetName) -Destination (Join-Path $assetDirectory $assetName) -Force }
Copy-Item -LiteralPath (Join-Path $projectRoot 'prototype\holidays') -Destination $assetDirectory -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'prototype\vendor') -Destination $assetDirectory -Recurse -Force
function Invoke-CheckedTool { param([string]$Executable, [string[]]$ToolArguments) & $Executable @ToolArguments; if ($LASTEXITCODE -ne 0) { throw "Tool failed ($LASTEXITCODE): $Executable" } }
Invoke-CheckedTool (Get-Command node.exe -ErrorAction Stop).Source @((Join-Path $PSScriptRoot 'build-mobile.mjs'),$assetDirectory)
$rawDirectory = Join-Path $buildDirectory 'res\raw'
New-Item -ItemType Directory -Path $rawDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $assetDirectory 'mobile-shell.html') -Destination (Join-Path $rawDirectory 'mobile_shell.html') -Force
$compiledResources = Join-Path $buildDirectory 'resources.zip'
$resourceApk = Join-Path $buildDirectory 'resources.apk'
Invoke-CheckedTool $aapt2 @('compile','--dir',(Join-Path $buildDirectory 'res'),'-o',$compiledResources)
Invoke-CheckedTool $aapt2 @('link','-o',$resourceApk,'-I',$androidJar,'--manifest',(Join-Path $buildDirectory 'AndroidManifest.xml'),'--java',$generatedDirectory,'-A',(Join-Path $buildDirectory 'assets'),$compiledResources)
$javaSources = @(Get-ChildItem -LiteralPath (Join-Path $buildDirectory 'src'),$generatedDirectory -Recurse -Filter '*.java' | ForEach-Object { $_.FullName })
Invoke-CheckedTool (Join-Path $buildJavaHome 'bin\javac.exe') (@('-encoding','UTF-8','--release','8','-classpath',($androidJar+';'+$voskJar+';'+$jnaJar),'-d',$classesDirectory) + $javaSources)
$classesJar = Join-Path $buildDirectory 'classes.jar'
Invoke-CheckedTool (Join-Path $buildJavaHome 'bin\jar.exe') @('--create','--file',$classesJar,'-C',$classesDirectory,'.')
Invoke-CheckedTool (Join-Path $buildJavaHome 'bin\java.exe') @('-cp',$d8Jar,'com.android.tools.r8.D8','--lib',$androidJar,'--min-api','26','--output',$dexDirectory,$classesJar,$voskJar,$jnaJar)
$unsignedApk = Join-Path $buildDirectory 'unsigned.apk'
Copy-Item -LiteralPath $resourceApk -Destination $unsignedApk -Force
Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
$apkZip = [System.IO.Compression.ZipFile]::Open($unsignedApk,[System.IO.Compression.ZipArchiveMode]::Update)
try {
    # Windows aapt2 emits backslashes inside asset names. Android treats those
    # as literal characters, so normalize assets before aligning and signing.
    foreach ($assetEntry in @($apkZip.Entries | Where-Object { $_.FullName.StartsWith('assets/') -and $_.FullName.Contains('\') })) {
        $normalizedName = $assetEntry.FullName.Replace('\','/')
        $memory = [System.IO.MemoryStream]::new()
        try {
            $inputStream = $assetEntry.Open()
            try { $inputStream.CopyTo($memory) } finally { $inputStream.Dispose() }
            $assetEntry.Delete()
            $compression = if ($normalizedName.EndsWith('.zip')) { [System.IO.Compression.CompressionLevel]::NoCompression } else { [System.IO.Compression.CompressionLevel]::Optimal }
            $newAsset = $apkZip.CreateEntry($normalizedName,$compression)
            $outputStream = $newAsset.Open()
            try { $memory.Position=0; $memory.CopyTo($outputStream) } finally { $outputStream.Dispose() }
        } finally { $memory.Dispose() }
    }
    if ($null -eq $apkZip.GetEntry('assets/speech/vosk-model-small-cn-0.22.zip')) { throw 'Bundled Mandarin model is missing from APK.' }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($apkZip,(Join-Path $dexDirectory 'classes.dex'),'classes.dex',[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    foreach ($abi in @('arm64-v8a','x86_64')) {
        foreach ($library in Get-ChildItem -LiteralPath (Join-Path $voiceRoot ('jni\'+$abi)) -Filter '*.so' -File) {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($apkZip,$library.FullName,('lib/'+$abi+'/'+$library.Name),[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    }
} finally { $apkZip.Dispose() }
$alignedApk = Join-Path $buildDirectory 'aligned.apk'
Invoke-CheckedTool $zipalign @('-p','-f','4',$unsignedApk,$alignedApk)
$signingDirectory = Join-Path $toolsRoot 'signing'
New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
$signingStore = Join-Path $signingDirectory 'preview.p12'
$passwordFile = Join-Path $signingDirectory 'password.txt'
if (-not (Test-Path -LiteralPath $signingStore)) {
    $randomBytes = New-Object byte[] 24
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($randomBytes) } finally { $generator.Dispose() }
    $signingPassword = [Convert]::ToBase64String($randomBytes)
    [System.IO.File]::WriteAllText($passwordFile,$signingPassword,[System.Text.Encoding]::ASCII)
    Invoke-CheckedTool (Join-Path $buildJavaHome 'bin\keytool.exe') @('-genkeypair','-keystore',$signingStore,'-storetype','PKCS12','-alias','calendar-ledger-preview','-storepass:file',$passwordFile,'-keyalg','RSA','-keysize','2048','-validity','3650','-dname','CN=Calendar Ledger AI Preview, O=Local Development, C=CN')
}
$stagedFinalApk = Join-Path $buildDirectory ("CalendarLedgerAI-v$appVersion.apk")
$finalApk = Join-Path $distributionDirectory ("CalendarLedgerAI-v$appVersion.apk")
Invoke-CheckedTool (Join-Path $buildJavaHome 'bin\java.exe') @('-jar',$signerJar,'sign','--ks',$signingStore,'--ks-key-alias','calendar-ledger-preview','--ks-pass',('file:'+$passwordFile),'--out',$stagedFinalApk,$alignedApk)
Invoke-CheckedTool (Join-Path $buildJavaHome 'bin\java.exe') @('-jar',$signerJar,'verify','--verbose',$stagedFinalApk)
Invoke-CheckedTool $aapt2 @('dump','badging',$stagedFinalApk)
Copy-Item -LiteralPath $stagedFinalApk -Destination $finalApk -Force
$apkInfo = Get-Item -LiteralPath $finalApk
$apkHash = (Get-FileHash -LiteralPath $finalApk -Algorithm SHA256).Hash.ToLowerInvariant()
[pscustomobject]@{ filename=$apkInfo.Name; bytes=$apkInfo.Length; sha256=$apkHash; package='org.calendarledger.preview'; minSdk=26; targetSdk=35; version=$appVersion; versionCode=[int]$appVersionCode } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $distributionDirectory 'apk-info.json') -Encoding UTF8
Write-Output "APK_READY=$finalApk"
Write-Output "BUILD_STAGING=$buildDirectory"
