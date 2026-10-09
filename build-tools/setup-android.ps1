$ErrorActionPreference = 'Stop'
$toolsRoot = $PSScriptRoot
$sdkRoot = Join-Path $toolsRoot 'sdk'
$repositoryFile = Join-Path $toolsRoot 'android-repository.xml'
New-Item -ItemType Directory -Path $sdkRoot -Force | Out-Null
Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/repository2-1.xml' -OutFile $repositoryFile -TimeoutSec 90
[xml]$repository = Get-Content -LiteralPath $repositoryFile -Raw
$packageNames = @('platforms;android-35', 'build-tools;35.0.0')
$manifest = @()
foreach ($packageName in $packageNames) {
    $package = $repository.SelectNodes("//*[local-name()='remotePackage']") | Where-Object { $_.GetAttribute('path') -eq $packageName } | Select-Object -First 1
    if (-not $package) { throw "SDK package not found: $packageName" }
    $archives = $package.SelectNodes("*[local-name()='archives']/*[local-name()='archive']")
    $archive = $archives | Where-Object { $hostNode = $_.SelectSingleNode("*[local-name()='host-os']"); (-not $hostNode) -or ($hostNode.InnerText -eq 'windows') } | Select-Object -First 1
    $complete = $archive.SelectSingleNode("*[local-name()='complete']")
    $archiveName = $complete.SelectSingleNode("*[local-name()='url']").InnerText
    $archiveChecksum = $complete.SelectSingleNode("*[local-name()='checksum']").InnerText
    $archivePath = Join-Path $toolsRoot $archiveName
    if (-not (Test-Path -LiteralPath $archivePath)) {
        Write-Output "Downloading $archiveName"
        Invoke-WebRequest -Uri ("https://dl.google.com/android/repository/" + $archiveName) -OutFile $archivePath -TimeoutSec 600
    }
    $actualChecksum = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA1).Hash.ToLowerInvariant()
    if ($actualChecksum -ne $archiveChecksum.ToLowerInvariant()) { throw "SDK checksum mismatch: $archiveName" }
    $extractDirectory = Join-Path $sdkRoot ($packageName.Replace(';', '-'))
    if (-not (Test-Path -LiteralPath $extractDirectory)) { Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDirectory }
    $manifest += [pscustomobject]@{ package = $packageName; archive = $archiveName; sha1 = $actualChecksum; directory = $extractDirectory }
    Write-Output "Verified $packageName"
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $toolsRoot 'sdk-packages.json') -Encoding UTF8
$holidayDirectory = Join-Path (Split-Path $toolsRoot -Parent) 'prototype\holidays'
New-Item -ItemType Directory -Path $holidayDirectory -Force | Out-Null
foreach ($holidayYear in @(2025, 2026, 2027)) {
    $holidayFile = Join-Path $holidayDirectory "$holidayYear.json"
    $holidayUrls = @("https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/$holidayYear.json", "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/$holidayYear.json")
    $downloaded = $false
    foreach ($holidayUrl in $holidayUrls) {
        try {
            Invoke-WebRequest -Uri $holidayUrl -OutFile $holidayFile -TimeoutSec 30
            $holidayData = Get-Content -LiteralPath $holidayFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($holidayData.year -ne $holidayYear) { throw 'Holiday year mismatch' }
            $downloaded = $true
            Write-Output "Holiday $holidayYear : $($holidayData.days.Count) dates"
            break
        } catch { Write-Output "Trying next holiday mirror for $holidayYear" }
    }
    if (-not $downloaded) { throw "Holiday data download failed: $holidayYear" }
}
Write-Output 'ANDROID_BUILD_INPUTS_READY'
