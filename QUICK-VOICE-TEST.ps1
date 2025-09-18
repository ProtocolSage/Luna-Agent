# QUICK-VOICE-TEST.ps1
# Quick voice system validation - minimal test for fast feedback

param(
    [int]$Port = 3000,
    [int]$TimeoutSeconds = 30
)

Write-Host "🚀 LUNA AGENT - QUICK VOICE SYSTEM TEST" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

# Quick health check
function Test-QuickEndpoint {
    param([string]$Url)
    try {
        $response = Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 5
        return $true
    } catch {
        return $false
    }
}

# Start Luna Agent
Write-Host "🔥 Starting Luna Agent..." -ForegroundColor Yellow

# Kill existing processes
Get-Process -Name "node", "electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start in background
$lunaJob = Start-Job -ScriptBlock {
    Set-Location $args[0]
    & npm start 2>&1
} -ArgumentList (Get-Location).Path

Write-Host "⏳ Waiting for Luna Agent to initialize..." -ForegroundColor Yellow

# Wait and test
$waited = 0
$maxWait = $TimeoutSeconds
$isReady = $false

while ($waited -lt $maxWait -and -not $isReady) {
    Start-Sleep -Seconds 2
    $waited += 2
    
    # Test if backend is responding
    if (Test-QuickEndpoint "http://localhost:$Port/health") {
        Write-Host "✅ Backend server is responding!" -ForegroundColor Green
        
        # Test voice endpoints - try multiple paths since route mounting might vary
        $voiceEndpoints = @(
            "http://localhost:$Port/api/voice/streaming/health",
            "http://localhost:$Port/api/voice/streaming/status", 
            "http://localhost:$Port/api/voice/tts/check"
        )
        
        $voiceWorking = $false
        foreach ($endpoint in $voiceEndpoints) {
            if (Test-QuickEndpoint $endpoint) {
                Write-Host "✅ Voice system is online! ($endpoint)" -ForegroundColor Green
                $voiceWorking = $true
                break
            }
        }
        
        if ($voiceWorking) {
            $isReady = $true
        } else {
            Write-Host "⚠️ Voice endpoints not responding, but backend is up" -ForegroundColor Yellow
        }
    }
    
    if (-not $isReady) {
        Write-Host "⏳ Still waiting... ($waited/$maxWait seconds)" -ForegroundColor Gray
    }
}

Write-Host ""

if ($isReady) {
    Write-Host "🎉 SUCCESS! Luna Agent is running with voice system!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎤 VOICE SYSTEM READY:" -ForegroundColor Cyan
    Write-Host "• Backend: http://localhost:$Port" -ForegroundColor White
    Write-Host "• Voice API: http://localhost:$Port/api/voice/streaming/*" -ForegroundColor White
    Write-Host "• WebSocket: ws://localhost:$Port/ws/voice/stream" -ForegroundColor White
    Write-Host ""
    Write-Host "🚀 Your AI voice agent is ready to use!" -ForegroundColor Yellow
    Write-Host ""
    
    # Check if Electron app is running
    $electronProcess = Get-Process -Name "electron" -ErrorAction SilentlyContinue
    if ($electronProcess) {
        Write-Host "✅ Electron app is running (PID: $($electronProcess.Id))" -ForegroundColor Green
        Write-Host "The Luna Agent window should be open now." -ForegroundColor White
    } else {
        Write-Host "⚠️ Backend is ready, but Electron app may still be loading..." -ForegroundColor Yellow
    }
    
} else {
    Write-Host "❌ TIMEOUT: Luna Agent did not start within $maxWait seconds" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "• Check if ports $Port and $($Port+1) are available" -ForegroundColor White
    Write-Host "• Ensure all dependencies are installed (npm install)" -ForegroundColor White
    Write-Host "• Verify OPENAI_API_KEY is set in environment" -ForegroundColor White
    Write-Host ""
    
    # Show job output for debugging
    $jobOutput = Receive-Job -Job $lunaJob -ErrorAction SilentlyContinue
    if ($jobOutput) {
        Write-Host "Debug output:" -ForegroundColor Gray
        $jobOutput[-10..-1] | Write-Host -ForegroundColor DarkGray  # Last 10 lines
    }
}

$duration = ((Get-Date) - $startTime).TotalSeconds
Write-Host ""
Write-Host "Test completed in $($duration.ToString('F1')) seconds" -ForegroundColor Gray

# Cleanup
if ($lunaJob) {
    Write-Host ""
    Write-Host "Note: Luna Agent is still running. To stop it:" -ForegroundColor Yellow
    Write-Host "• Close the Luna Agent window, or" -ForegroundColor White
    Write-Host "• Run: Get-Process -Name 'node','electron' | Stop-Process" -ForegroundColor White
}

Write-Host ""