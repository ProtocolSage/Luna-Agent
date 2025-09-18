[CmdletBinding()]
Param(
  [string]$Base = "http://localhost:3000",
  [string]$Audio = ""
)

$ErrorActionPreference = 'Stop'

function Resolve-AudioSample {
  param(
    [string]$RequestedPath
  )

  $fixture = Join-Path $PSScriptRoot 'fixtures/hello_luna.wav'
  if ([string]::IsNullOrWhiteSpace($RequestedPath)) {
    $RequestedPath = $fixture
  }

  if (Test-Path $RequestedPath) {
    return (Resolve-Path $RequestedPath).Path
  }

  if (Test-Path $fixture) {
    return (Resolve-Path $fixture).Path
  }

  if ($IsWindows) {
    try {
      $temp = Join-Path ([System.IO.Path]::GetTempPath()) 'voice-probe-generated.wav'
      Write-Host "[probe] Generating fallback WAV via SAPI -> $temp"
      $voice = New-Object -ComObject SAPI.SpVoice
      $stream = New-Object -ComObject SAPI.SpFileStream
      $fileMode = 3 # SSFMCreateForWrite
      $stream.Open($temp, $fileMode, $false)
      $voice.AudioOutputStream = $stream
      $voice.Speak('Hello Luna. Voice probe speaking.') | Out-Null
      $stream.Close()
      return $temp
    } catch {
      Write-Host "[probe] Failed to generate audio via SAPI: $($_.Exception.Message)" -ForegroundColor Red
      throw
    }
  }

  throw "Audio sample not found. Provide -Audio or add fixtures/hello_luna.wav."
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Invoke-JsonRequest {
  param(
    [string]$Uri,
    [string]$Method = 'Get',
    [hashtable]$Headers,
    [hashtable]$Form
  )

  if ($Form) {
    $response = Invoke-WebRequest -Uri $Uri -Method $Method -Headers $Headers -Form $Form
  } else {
    $response = Invoke-WebRequest -Uri $Uri -Method $Method -Headers $Headers
  }

  $body = $null
  if ($response.Content) {
    $body = $response.Content | ConvertFrom-Json
  }
  return [pscustomobject]@{
    StatusCode = $response.StatusCode
    Headers = $response.Headers
    Body = $body
  }
}

function Invoke-ExpectFailure {
  param(
    [string]$Uri,
    [hashtable]$Headers
  )

  try {
    Invoke-WebRequest -Uri $Uri -Method Post -Headers $Headers -Form @{ placeholder = '1' } | Out-Null
    throw 'Expected request to fail with 400.'
  } catch [System.Net.WebException] {
    if ($_.Exception.Response) {
      return $_.Exception.Response
    }
    throw
  } catch [Microsoft.PowerShell.Commands.HttpResponseException] {
    if ($_.Response) {
      return $_.Response
    }
    throw
  }
}

try {
  $audioPath = Resolve-AudioSample -RequestedPath $Audio
  Write-Host "[probe] Using audio sample: $audioPath"

  $canonicalBase = $Base.TrimEnd('/')
  $headers = @{ 'x-api-key' = 'dev-local' }

  Write-Host "[probe] GET $canonicalBase/api/voice/tts/check"
  $ttsResponse = Invoke-WebRequest -Uri "$canonicalBase/api/voice/tts/check" -Method Get -TimeoutSec 30
  Assert-True ($ttsResponse.StatusCode -eq 200) 'TTS check did not return 200.'
  $ttsJson = $null
  if ($ttsResponse.Content) { $ttsJson = $ttsResponse.Content | ConvertFrom-Json }
  Assert-True ($ttsJson -and $ttsJson.providers) 'TTS providers payload missing.'

  Write-Host "[probe] POST $canonicalBase/api/voice/transcribe"
  $transcribe = Invoke-JsonRequest -Uri "$canonicalBase/api/voice/transcribe" -Method Post -Headers $headers -Form @{ file = Get-Item $audioPath }
  Assert-True ($transcribe.StatusCode -eq 200) 'Transcribe endpoint did not return 200.'
  Assert-True (-not [string]::IsNullOrWhiteSpace($transcribe.Body?.text)) 'Transcribe response missing text.'

  Write-Host "[probe] POST $canonicalBase/api/voice/stt"
  $sttResponse = Invoke-WebRequest -Uri "$canonicalBase/api/voice/stt" -Method Post -Headers $headers -Form @{ file = Get-Item $audioPath }
  $sttJson = $sttResponse.Content | ConvertFrom-Json
  Assert-True ($sttResponse.StatusCode -eq 200) '/api/voice/stt did not return 200.'
  $deprecation = $sttResponse.Headers['Deprecation']
  Assert-True ($deprecation -and $deprecation.ToString().ToLower() -eq 'true') 'Legacy /stt route missing Deprecation header.'
  Assert-True (-not [string]::IsNullOrWhiteSpace($sttJson?.text)) 'Legacy /stt response missing text.'

  Write-Host "[probe] POST $canonicalBase/api/voice/transcribe (empty multipart)"
  $errorResponse = Invoke-ExpectFailure -Uri "$canonicalBase/api/voice/transcribe" -Headers $headers
  $statusCode = $null
  if ($errorResponse -is [System.Net.HttpWebResponse]) {
    $statusCode = [int]$errorResponse.StatusCode
  } elseif ($errorResponse -and $errorResponse.StatusCode) {
    $statusCode = [int]$errorResponse.StatusCode.Value__
  }
  Assert-True ($statusCode -eq 400) "Expected 400 on missing file, received $statusCode."

  Write-Host '[probe] Voice probe completed successfully.' -ForegroundColor Green
  exit 0
} catch {
  Write-Host "[probe] FAILED: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
