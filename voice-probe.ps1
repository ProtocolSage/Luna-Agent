Param(
  [string]$Base = "http://localhost:3000",
  [string]$Audio = "luna_test.wav"
)

Write-Host "[probe] TTS check -> $Base/api/voice/tts/check"
try {
  $tts = Invoke-RestMethod -Uri "$Base/api/voice/tts/check" -Method Get
  Write-Host "[probe] TTS providers:" ($tts.providers | ConvertTo-Json -Compress)
} catch {
  Write-Host "[probe] TTS check failed:" $_.Exception.Message -ForegroundColor Red
}

if (-not (Test-Path $Audio)) {
  Write-Host "[probe] Audio file not found: $Audio" -ForegroundColor Yellow
  Write-Host "[probe] Place a small wav file next to this script or pass -Audio" -ForegroundColor Yellow
  exit 1
}

Write-Host "[probe] STT transcribe -> $Base/api/voice/transcribe"
try {
  $res = Invoke-RestMethod -Uri "$Base/api/voice/transcribe" -Method Post -Headers @{ 'x-api-key' = 'dev-local' } -Form @{ file = Get-Item $Audio }
  Write-Host "[probe] transcription:" $res.transcription
} catch {
  Write-Host "[probe] STT transcribe failed:" $_.Exception.Message -ForegroundColor Red
  if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $body = $reader.ReadToEnd()
    Write-Host "[probe] Response body:" $body
  }
  exit 1
}

Write-Host "[probe] Done." -ForegroundColor Green

