$ErrorActionPreference = "Stop"

# 1) Build
npm run build

# 2) Start backend
$job = Start-Job { npm run backend }
Start-Sleep -Seconds 1

# 3) Wait for health
$ok = $false
for ($i=0; $i -lt 30; $i++) {
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -eq 200 -and $resp.Content -match "OK") { $ok = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 500
}
if (-not $ok) { throw "Health check failed" }

# 4) Optional TTS if key present
if ($env:ELEVEN_API_KEY) {
  Invoke-WebRequest -Method Post -Uri "http://localhost:3000/api/voice/tts" -ContentType "application/json" -Body '{"text":"Ping from script","voice":"Rachel"}' -OutFile "test.wav"
  if (-not (Test-Path .\test.wav)) { Write-Host "TTS route responded but no file saved (service might play audio directly)"; }
}

# 5) Kill backend
Stop-Job $job | Out-Null
Receive-Job $job | Out-Null
Remove-Job $job | Out-Null

Write-Host "✅ Dev check passed"
