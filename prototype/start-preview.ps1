$ErrorActionPreference = 'Stop'
$previewDirectory = $PSScriptRoot
$previewUrl = 'http://127.0.0.1:8788'
$isPreviewRunning = $false
try {
    $previewHealth = Invoke-RestMethod -Uri "$previewUrl/api/health" -TimeoutSec 2
    $isPreviewRunning = $previewHealth.app -eq 'calendar-ledger-ai-preview'
} catch { }
if (-not $isPreviewRunning) {
    $nodeExecutable = (Get-Command node -ErrorAction Stop).Source
    Start-Process -FilePath $nodeExecutable -ArgumentList 'server.mjs' -WorkingDirectory $previewDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $previewDirectory 'preview-server.log') -RedirectStandardError (Join-Path $previewDirectory 'preview-server-error.log')
    for ($previewAttempt = 0; $previewAttempt -lt 25; $previewAttempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $previewHealth = Invoke-RestMethod -Uri "$previewUrl/api/health" -TimeoutSec 1
            if ($previewHealth.app -eq 'calendar-ledger-ai-preview') { $isPreviewRunning = $true; break }
        } catch { }
    }
}
if (-not $isPreviewRunning) { throw '预览服务未能启动，请查看 preview-server-error.log。' }
Start-Process $previewUrl
