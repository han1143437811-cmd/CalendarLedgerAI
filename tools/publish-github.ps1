param(
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9-]*$')][string]$RepositoryOwner = '',
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*$')][string]$RepositoryName = 'CalendarLedgerAI',
    [switch]$Private
)
$ErrorActionPreference = 'Stop'
$publishRoot = Split-Path $PSScriptRoot -Parent
$publishAssets = Join-Path $publishRoot 'release-assets'
$publishTag = 'v0.2.3'
$publishApk = Join-Path $publishAssets 'CalendarLedgerAI-v0.2.3.apk'
$expectedApkHash = 'cb7e32c66ec8b9e7d1a4bc5d36843e457901c83b61f8a089eddbc519128580ba'

function Invoke-PublishCommand {
    param([string]$Program, [string[]]$CommandArguments)
    & $Program @CommandArguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed: $Program $($CommandArguments[0])" }
}

function Invoke-PublishProbe {
    param([string]$Program, [string[]]$CommandArguments)
    # Windows PowerShell 5 treats native stderr as a terminating error when
    # ErrorActionPreference is Stop, including expected repository 404s.
    $publishPreviousAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $publishProbeOutput = @(& $Program @CommandArguments 2>$null)
        $publishProbeExit = $LASTEXITCODE
        [pscustomobject]@{ ExitCode = $publishProbeExit; Output = $publishProbeOutput }
    } finally { $ErrorActionPreference = $publishPreviousAction }
}

Push-Location -LiteralPath $publishRoot
try {
    $publishProfileText = & gh api user --jq '{login: .login, id: .id}'
    if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated. Complete gh auth login --hostname github.com --git-protocol https --web first.' }
    $publishProfile = $publishProfileText | ConvertFrom-Json
    if (-not $RepositoryOwner) { $RepositoryOwner = $publishProfile.login }
    if ($RepositoryOwner -notmatch '^[A-Za-z0-9][A-Za-z0-9-]*$') { throw 'Invalid repository owner.' }
    $publishRepository = "$RepositoryOwner/$RepositoryName"
    $publishUrl = "https://github.com/$publishRepository"
    $publishNoreply = "$($publishProfile.id)+$($publishProfile.login)@users.noreply.github.com"

    if ((Get-FileHash -LiteralPath $publishApk -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedApkHash) { throw 'APK hash changed; stop and verify the intended release.' }
    Invoke-PublishCommand 'python' @('tools/verify-publication.py')
    $publishRemoteProbe = Invoke-PublishProbe 'git' @('remote','get-url','origin')
    $publishRemoteExists = $publishRemoteProbe.ExitCode -eq 0
    $publishRemote = ($publishRemoteProbe.Output -join '').Trim()
    if ($publishRemoteExists -and $publishRemote -notin @($publishUrl, "$publishUrl.git")) { throw 'Origin points to another repository; no remote write was performed.' }

    $publishRepoProbe = Invoke-PublishProbe 'gh' @('repo','view',$publishRepository,'--json','url,nameWithOwner')
    $publishRepoExists = $publishRepoProbe.ExitCode -eq 0
    if ($publishRepoExists -and -not $publishRemoteExists) { throw 'A repository with this name already exists. Choose another name or explicitly review its relationship before continuing.' }

    $publishHeadProbe = Invoke-PublishProbe 'git' @('rev-parse','--verify','HEAD')
    $publishHasCommit = $publishHeadProbe.ExitCode -eq 0
    if (-not $publishHasCommit) {
        Invoke-PublishCommand 'git' @('add','--all')
        Invoke-PublishCommand 'git' @('-c',"user.name=$($publishProfile.login)",'-c',"user.email=$publishNoreply",'commit','-m','Publish CalendarLedgerAI 0.2.3 with Fossify and dependency acknowledgements')
    }
    $publishChanges = & git status --porcelain
    if ($publishChanges) { throw 'The prepared source has uncommitted changes. Review and commit them before publishing.' }
    $publishCommit = (& git rev-parse HEAD).Trim()

    if (-not $publishRepoExists) {
        $publishVisibility = if ($Private) { '--private' } else { '--public' }
        Invoke-PublishCommand 'gh' @('repo','create',$publishRepository,$publishVisibility,'--source',$publishRoot,'--remote','origin','--description','Calendar, ledger and AI assistant for Android. With heartfelt thanks to Fossify Calendar and the open-source community.','--disable-wiki')
    }
    Invoke-PublishCommand 'git' @('-c','credential.helper=','-c','credential.helper=!gh auth git-credential','push','-u','origin','main')

    $publishTagProbe = Invoke-PublishProbe 'git' @('rev-parse','--verify',"refs/tags/$publishTag")
    if ($publishTagProbe.ExitCode -ne 0) { Invoke-PublishCommand 'git' @('tag',$publishTag,$publishCommit) }
    $publishTagCommit = (& git rev-list -n 1 $publishTag).Trim()
    if ($publishTagCommit -ne $publishCommit) { throw 'The version tag points to a different commit.' }
    Invoke-PublishCommand 'git' @('-c','credential.helper=','-c','credential.helper=!gh auth git-credential','push','origin',"refs/tags/$publishTag")

    $publishSource = Join-Path $publishAssets 'CalendarLedgerAI-v0.2.3-public-source.zip'
    Invoke-PublishCommand 'git' @('archive','--format=zip',"--output=$publishSource",$publishCommit)
    Copy-Item -LiteralPath (Join-Path $publishRoot 'dist/手机安装说明.md') -Destination (Join-Path $publishAssets 'INSTALL.md') -Force
    Copy-Item -LiteralPath (Join-Path $publishRoot 'dist/验证结果-v0.2.3.json') -Destination (Join-Path $publishAssets 'VALIDATION-v0.2.3.json') -Force
    Copy-Item -LiteralPath (Join-Path $publishRoot 'LICENSE') -Destination (Join-Path $publishAssets 'LICENSE-GPL-3.0.txt') -Force
    Copy-Item -LiteralPath (Join-Path $publishRoot 'prototype/THIRD_PARTY_NOTICES.txt') -Destination (Join-Path $publishAssets 'THIRD_PARTY_NOTICES.txt') -Force
    $publishAssetNames = @('CalendarLedgerAI-v0.2.3.apk','CalendarLedgerAI-v0.2.3-public-source.zip','INSTALL.md','VALIDATION-v0.2.3.json','LICENSE-GPL-3.0.txt','THIRD_PARTY_NOTICES.txt')
    $publishHashes = foreach ($publishAssetName in $publishAssetNames) {
        $publishHash = (Get-FileHash -LiteralPath (Join-Path $publishAssets $publishAssetName) -Algorithm SHA256).Hash.ToLowerInvariant()
        "$publishHash  $publishAssetName"
    }
    [System.IO.File]::WriteAllLines((Join-Path $publishAssets 'SHA256SUMS.txt'),[string[]]$publishHashes,[System.Text.UTF8Encoding]::new($false))
    $publishAssetNames += 'SHA256SUMS.txt'
    $publishAssetPaths = @($publishAssetNames | ForEach-Object { Join-Path $publishAssets $_ })
    $publishReleaseProbe = Invoke-PublishProbe 'gh' @('release','view',$publishTag,'--repo',$publishRepository,'--json','isDraft')
    if ($publishReleaseProbe.ExitCode -eq 0) {
        $publishExistingRelease = ($publishReleaseProbe.Output -join '') | ConvertFrom-Json
        if (-not $publishExistingRelease.isDraft) { throw 'This release is already published; no published assets were changed.' }
        Invoke-PublishCommand 'gh' (@('release','upload',$publishTag,'--repo',$publishRepository,'--clobber') + $publishAssetPaths)
    } else {
        Invoke-PublishCommand 'gh' (@('release','create',$publishTag,'--repo',$publishRepository,'--verify-tag','--draft','--prerelease','--title','CalendarLedgerAI 0.2.3 - calendar, ledger and AI preview','--notes-file',(Join-Path $publishRoot 'RELEASE_NOTES.md')) + $publishAssetPaths)
    }
    $publishUploadedNames = & gh release view $publishTag --repo $publishRepository --json assets --jq '.assets[].name'
    if ($LASTEXITCODE -ne 0 -or (@(Compare-Object $publishAssetNames @($publishUploadedNames)).Length -gt 0)) { throw 'Release attachment verification failed; the release remains a draft.' }
    Invoke-PublishCommand 'gh' @('release','edit',$publishTag,'--repo',$publishRepository,'--draft=false','--prerelease','--latest=false')
    Invoke-PublishCommand 'gh' @('release','view',$publishTag,'--repo',$publishRepository,'--json','url,isDraft,isPrerelease,assets')
    Write-Output "PUBLISHED_REPOSITORY=$publishUrl"
    Write-Output "PUBLISHED_COMMIT=$publishCommit"
} finally { Pop-Location }
