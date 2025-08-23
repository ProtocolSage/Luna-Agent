param(
  [int]$MinPort = 3000,
  [int]$MaxPort = 3010,
  [string]$SessionId = "dev",
  [string]$OutDir = ".\smoke_artifacts",
  [string]$AudioIn = ".\sample.wav",
  [switch]$StartBackend
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pass = 0; $fail = 0; $skip = 0
function OK($n,$d=""){ $script:pass++; Write-Host "[PASS] $n" -ForegroundColor Green; if($d){Write-Host "       $d" -ForegroundColor DarkGreen} }
function NO($n,$d=""){ $script:fail++; Write-Host "[FAIL] $n" -ForegroundColor Red; if($d){Write-Host "       $d" -ForegroundColor DarkRed} }
function SK($n,$d=""){ $script:skip++; Write-Host "[SKIP] $n" -ForegroundColor Yellow; if($d){Write-Host "       $d" -ForegroundColor DarkYellow} }

function Find-BackendPort {
  foreach($p in $MinPort..$MaxPort){
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:$p/health" -TimeoutSec 1 -UseBasicParsing
      if($r.StatusCode -eq 200){ return $p }
    } catch { }
  }
  return $null
}

if($StartBackend){
  try{
    $wd = (Get-Location).Path
    $null = Start-Process -FilePath "npm" -ArgumentList "run","backend" -WorkingDirectory $wd -WindowStyle Minimized
  } catch {
    NO "Start backend" "$($_.Exception.Message)"
  }
  $port = $null
  for($i=0;$i -lt 40;$i++){
    $port = Find-BackendPort
    if($port){ break }
    Start-Sleep -Milliseconds 500
  }
} else {
  $port = Find-BackendPort
}

if(-not $port){
  NO "Discover backend" "No /health on ports $MinPort..$MaxPort. Is the backend running?"
  Write-Host ("`nRESULT: PASS={0} FAIL={1} SKIP={2}" -f $pass,$fail,$skip)
  exit 1
} else {
  OK "Discover backend" "http://localhost:$port"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$base = "http://localhost:$port"

# Health
try {
  $health = Invoke-RestMethod -Uri "$base/health" -TimeoutSec 3
  OK "GET /health" ("status=" + ($health.status | Out-String).Trim())
} catch { NO "GET /health" "$($_.Exception.Message)" }

# TTS provider check
try {
  $check = Invoke-RestMethod -Uri "$base/api/voice/tts/check" -TimeoutSec 5
  $providers = ($check.providers | ConvertTo-Json -Depth 5)
  OK "GET /api/voice/tts/check" ("providers=" + $providers)
} catch { NO "GET /api/voice/tts/check" "$($_.Exception.Message)" }

# Memory: add
try {
  $payload = @{ content = "hey luna"; type = "note"; sessionId = $SessionId } | ConvertTo-Json -Depth 5
  $add = Invoke-RestMethod -Method Post -Uri "$base/api/memory/add" -ContentType "application/json" -Body $payload -TimeoutSec 10
  if($add.ok -or $add.id){ OK "POST /api/memory/add" ("id=" + ($add.id | Out-String).Trim()) } else { NO "POST /api/memory/add" ("Unexpected payload: " + ($add | ConvertTo-Json -Depth 10)) }
} catch { NO "POST /api/memory/add" "$($_.Exception.Message)" }

# Memory: recent
try {
  $recent = Invoke-RestMethod -Uri "$base/api/memory/recent?limit=5&sessionId=$SessionId" -TimeoutSec 10
  $count = ($recent.items | Measure-Object).Count
  OK "GET /api/memory/recent" ("items=" + $count)
} catch { NO "GET /api/memory/recent" "$($_.Exception.Message)" }

# Memory: search
try {
  $search = Invoke-RestMethod -Uri "$base/api/memory/search?q=hey%20luna&k=5&sessionId=$SessionId" -TimeoutSec 10
  $count = ($search.items | Measure-Object).Count
  OK "GET /api/memory/search" ("items=" + $count)
} catch { NO "GET /api/memory/search" "$($_.Exception.Message)" }

# TTS mp3 (ElevenLabs preferred with backend fallback to OpenAI)
$mp3 = Join-Path $OutDir ("tts_{0}.mp3" -f (Get-Date -Format "yyyyMMdd_HHmmss"))
try {
  $ttsBody = @{ text = "Luna online. Systems nominal."; voiceId = "21m00Tcm4TlvDq8ikWAM"; stability = 0.55; similarityBoost = 0.75 } | ConvertTo-Json -Depth 5
  Invoke-WebRequest -Method Post -Uri "$base/api/voice/tts" -ContentType "application/json" -Body $ttsBody -OutFile $mp3 -TimeoutSec 60 -UseBasicParsing
  $len = (Get-Item $mp3).Length
  if($len -gt 1000){ OK "POST /api/voice/tts" ("saved " + $mp3 + " (" + $len + " bytes)") } else { NO "POST /api/voice/tts" ("file too small: " + $len + " bytes") }
} catch { NO "POST /api/voice/tts" "$($_.Exception.Message)" }

# STT transcribe (requires a real audio file)
if(Test-Path $AudioIn){
  try {
    $hasCurl = (Get-Command curl.exe -ErrorAction SilentlyContinue) -ne $null
    if($hasCurl){
      $json = & curl.exe -s -X POST "$base/api/voice/transcribe" -H "Accept: application/json" -F ("file=@{0}" -f (Resolve-Path $AudioIn))
      $tr = $null
      if($json){ $tr = $json | ConvertFrom-Json }
      if($tr -and $tr.transcription){ OK "POST /api/voice/transcribe" ("text=" + $tr.transcription) } else { NO "POST /api/voice/transcribe" ("unexpected: " + $json) }
    } else {
      if($PSVersionTable.PSVersion.Major -ge 6){
        $form = @{ file = Get-Item (Resolve-Path $AudioIn) }
        $res = Invoke-RestMethod -Method Post -Uri "$base/api/voice/transcribe" -Form $form -TimeoutSec 60
        if($res.transcription){ OK "POST /api/voice/transcribe" ("text=" + $res.transcription) } else { NO "POST /api/voice/transcribe" ("unexpected: " + ($res | ConvertTo-Json -Depth 10)) }
      } else {
        SK "POST /api/voice/transcribe" "No curl.exe and PS<6 (multipart not supported)."
      }
    }
  } catch { NO "POST /api/voice/transcribe" "$($_.Exception.Message)" }
} else {
  SK "POST /api/voice/transcribe" ("Audio file not found: " + $AudioIn)
}

Write-Host ""
Write-Host ("RESULT: PASS={0} FAIL={1} SKIP={2}" -f $pass,$fail,$skip) -ForegroundColor Cyan
if($fail -gt 0){ exit 1 } else { exit 0 }
