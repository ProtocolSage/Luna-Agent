# DEBUG-VOICE-ROUTES.ps1
# Debug script to check what routes are actually available

Write-Host "🔍 LUNA AGENT - VOICE ROUTES DEBUG" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

$port = 3000

# Function to test endpoint with detailed response
function Test-EndpointDetails {
    param([string]$Url, [string]$Description)
    
    Write-Host "Testing: $Description" -ForegroundColor Yellow
    Write-Host "URL: $Url" -ForegroundColor Gray
    
    try {
        $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 5
        Write-Host "✅ Status: $($response.StatusCode) $($response.StatusDescription)" -ForegroundColor Green
        
        if ($response.Content) {
            try {
                $json = $response.Content | ConvertFrom-Json
                Write-Host "📄 Response:" -ForegroundColor Gray
                $json | ConvertTo-Json -Depth 2 | Write-Host -ForegroundColor White
            } catch {
                Write-Host "📄 Response (text): $($response.Content.Substring(0, [Math]::Min(200, $response.Content.Length)))" -ForegroundColor White
            }
        }
        
        return $true
    } catch {
        $statusCode = $_.Exception.Response.StatusCode
        Write-Host "❌ Failed: HTTP $statusCode" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        
        if ($_.Exception.Response) {
            try {
                $errorContent = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($errorContent)
                $errorText = $reader.ReadToEnd()
                Write-Host "Error response: $errorText" -ForegroundColor DarkRed
            } catch {
                # Ignore stream reading errors
            }
        }
        
        return $false
    }
    
    Write-Host ""
}

# Start backend if not running
Write-Host "🚀 Ensuring backend is running..." -ForegroundColor Yellow

$backendRunning = $false
try {
    $healthCheck = Invoke-RestMethod -Uri "http://localhost:$port/health" -Method GET -TimeoutSec 3
    $backendRunning = $true
    Write-Host "✅ Backend is already running" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Backend not running, starting it..." -ForegroundColor Yellow
    
    # Start backend
    $backendJob = Start-Job -ScriptBlock {
        Set-Location $args[0]
        & npm run dev:backend
    } -ArgumentList (Get-Location).Path
    
    # Wait for startup
    $attempts = 0
    while (-not $backendRunning -and $attempts -lt 15) {
        Start-Sleep -Seconds 2
        $attempts++
        try {
            $healthCheck = Invoke-RestMethod -Uri "http://localhost:$port/health" -Method GET -TimeoutSec 2
            $backendRunning = $true
            Write-Host "✅ Backend started successfully" -ForegroundColor Green
        } catch {
            Write-Host "⏳ Waiting for backend... (attempt $attempts/15)" -ForegroundColor Gray
        }
    }
}

if (-not $backendRunning) {
    Write-Host "❌ Could not start backend server" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔍 Testing available endpoints..." -ForegroundColor Magenta
Write-Host ""

# Test basic endpoints first
$endpoints = @(
    @{ Url = "http://localhost:$port/health"; Description = "Health check" },
    @{ Url = "http://localhost:$port/api"; Description = "API root" },
    @{ Url = "http://localhost:$port/api/voice"; Description = "Voice API root" },
    @{ Url = "http://localhost:$port/api/voice/tts/check"; Description = "Legacy voice TTS check" },
    @{ Url = "http://localhost:$port/api/voice/streaming"; Description = "Streaming voice root" },
    @{ Url = "http://localhost:$port/api/voice/streaming/status"; Description = "Streaming voice status" },
    @{ Url = "http://localhost:$port/api/voice/streaming/health"; Description = "Streaming voice health" },
    @{ Url = "http://localhost:$port/api/voice/streaming/sessions"; Description = "Streaming voice sessions" }
)

$results = @()
foreach ($endpoint in $endpoints) {
    $result = Test-EndpointDetails -Url $endpoint.Url -Description $endpoint.Description
    $results += @{ Url = $endpoint.Url; Success = $result }
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "📊 RESULTS SUMMARY:" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan

$successCount = ($results | Where-Object { $_.Success -eq $true }).Count
$totalCount = $results.Count

Write-Host "Successful endpoints: $successCount/$totalCount" -ForegroundColor $(if ($successCount -eq $totalCount) { 'Green' } else { 'Yellow' })

Write-Host ""
Write-Host "Working endpoints:" -ForegroundColor Green
$results | Where-Object { $_.Success -eq $true } | ForEach-Object {
    Write-Host "✅ $($_.Url)" -ForegroundColor White
}

if ($successCount -lt $totalCount) {
    Write-Host ""
    Write-Host "Failed endpoints:" -ForegroundColor Red
    $results | Where-Object { $_.Success -eq $false } | ForEach-Object {
        Write-Host "❌ $($_.Url)" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "🔧 TROUBLESHOOTING GUIDE:" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan

if ($successCount -eq 0) {
    Write-Host "❌ No endpoints working - Backend may have failed to start" -ForegroundColor Red
    Write-Host "Solutions:" -ForegroundColor Yellow
    Write-Host "• Check if backend compiled correctly: npm run build:backend" -ForegroundColor White
    Write-Host "• Check for TypeScript errors in the backend" -ForegroundColor White
    Write-Host "• Verify all dependencies are installed: npm install" -ForegroundColor White
} elseif (($results | Where-Object { $_.Url -like "*voice*" -and $_.Success -eq $false }).Count -gt 0) {
    Write-Host "⚠️ Voice endpoints not working - Route mounting issue" -ForegroundColor Yellow
    Write-Host "Solutions:" -ForegroundColor Yellow
    Write-Host "• Voice routes may not be properly mounted in server.ts" -ForegroundColor White
    Write-Host "• Check if streamingVoice.ts compiled correctly" -ForegroundColor White
    Write-Host "• Verify voice router import in server.ts" -ForegroundColor White
} else {
    Write-Host "✅ All endpoints working - Voice system should be operational!" -ForegroundColor Green
}

Write-Host ""

# Clean up if we started the backend
if ($backendJob) {
    Write-Host "Note: Backend was started by this script and may still be running." -ForegroundColor Gray
    Write-Host "To stop: Get-Process -Name 'node' | Stop-Process" -ForegroundColor Gray
}