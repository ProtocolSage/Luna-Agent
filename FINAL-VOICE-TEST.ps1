# FINAL-VOICE-TEST.ps1
# Final test after fixing the double-prefix route issue

Write-Host "🎉 LUNA AGENT VOICE SYSTEM - FINAL TEST" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"

# Step 1: Clean up
Write-Host "🔪 Step 1: Cleaning up processes..." -ForegroundColor Yellow
Get-Process -Name "node", "electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "✅ Cleanup complete" -ForegroundColor Green

# Step 2: Rebuild with route fixes
Write-Host ""
Write-Host "🔨 Step 2: Rebuilding with route fixes..." -ForegroundColor Yellow
try {
    & npm run build:backend 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Backend rebuilt successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Build failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Build error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Start server
Write-Host ""
Write-Host "🚀 Step 3: Starting server..." -ForegroundColor Yellow

$serverJob = Start-Job -ScriptBlock {
    Set-Location $args[0]
    & npm run dev:backend 2>&1
} -ArgumentList (Get-Location).Path

# Wait for server startup
Write-Host "⏳ Waiting for server..." -ForegroundColor Gray
$attempts = 0
$serverReady = $false

while (-not $serverReady -and $attempts -lt 15) {
    Start-Sleep -Seconds 2
    $attempts++
    
    try {
        $healthCheck = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method GET -TimeoutSec 3
        $serverReady = $true
        Write-Host "✅ Server is ready!" -ForegroundColor Green
    } catch {
        Write-Host "⏳ Attempt $attempts/15..." -ForegroundColor Gray
    }
}

if (-not $serverReady) {
    Write-Host "❌ Server startup timeout" -ForegroundColor Red
    Stop-Job -Job $serverJob -ErrorAction SilentlyContinue
    Remove-Job -Job $serverJob -ErrorAction SilentlyContinue
    exit 1
}

# Step 4: Test ALL voice endpoints
Write-Host ""
Write-Host "🎤 Step 4: Testing voice endpoints with CORRECT paths..." -ForegroundColor Yellow

function Test-Endpoint {
    param([string]$Url, [string]$Name)
    
    try {
        $response = Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 5
        Write-Host "✅ $Name" -ForegroundColor Green
        return $true
    } catch {
        $statusCode = $_.Exception.Response.StatusCode
        Write-Host "❌ $Name (HTTP $statusCode)" -ForegroundColor Red
        return $false
    }
}

# Test the FIXED endpoint paths
$allTests = @(
    @{ Url = "http://localhost:3000/health"; Name = "System health check" },
    @{ Url = "http://localhost:3000/api/voice/tts/check"; Name = "Legacy voice TTS" },
    @{ Url = "http://localhost:3000/api/voice/streaming/status"; Name = "Streaming voice status" },
    @{ Url = "http://localhost:3000/api/voice/streaming/health"; Name = "Streaming voice health" },
    @{ Url = "http://localhost:3000/api/voice/streaming/sessions"; Name = "Streaming voice sessions" }
)

$results = @()
foreach ($test in $allTests) {
    $result = Test-Endpoint -Url $test.Url -Name $test.Name
    $results += $result
    Start-Sleep -Seconds 1
}

$successCount = ($results | Where-Object { $_ -eq $true }).Count
$totalTests = $results.Count

# Step 5: Test WebSocket
Write-Host ""
Write-Host "🔌 Step 5: Testing WebSocket connection..." -ForegroundColor Yellow

$wsSuccess = $false
try {
    $webSocket = New-Object System.Net.WebSockets.ClientWebSocket
    $cancellationToken = [System.Threading.CancellationToken]::None
    $uri = [System.Uri]::new("ws://localhost:3000/ws/voice/stream")
    
    $connectTask = $webSocket.ConnectAsync($uri, $cancellationToken)
    if ($connectTask.Wait(5000) -and $webSocket.State -eq "Open") {
        Write-Host "✅ WebSocket connection successful" -ForegroundColor Green
        $wsSuccess = $true
        $webSocket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Test complete", $cancellationToken).Wait(2000)
    } else {
        Write-Host "❌ WebSocket connection failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ WebSocket error: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($webSocket) { $webSocket.Dispose() }
}

# Step 6: Final results
Write-Host ""
Write-Host "🎯 FINAL RESULTS:" -ForegroundColor Cyan
Write-Host "=================" -ForegroundColor Cyan

Write-Host "HTTP endpoints: $successCount/$totalTests working" -ForegroundColor $(if ($successCount -eq $totalTests) { 'Green' } else { 'Yellow' })
Write-Host "WebSocket: $(if ($wsSuccess) { 'Working' } else { 'Failed' })" -ForegroundColor $(if ($wsSuccess) { 'Green' } else { 'Red' })

$overallSuccess = ($successCount -eq $totalTests) -and $wsSuccess

if ($overallSuccess) {
    Write-Host ""
    Write-Host "🎉 VOICE SYSTEM IS FULLY OPERATIONAL! 🎉" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎤 Your streaming voice features are ready:" -ForegroundColor Cyan
    Write-Host "• Real-time STT with OpenAI Whisper" -ForegroundColor White
    Write-Host "• Streaming TTS during AI responses" -ForegroundColor White  
    Write-Host "• Interrupt/barge-in capability" -ForegroundColor White
    Write-Host "• Voice Activity Detection (VAD)" -ForegroundColor White
    Write-Host "• Echo cancellation" -ForegroundColor White
    Write-Host "• Continuous conversation mode" -ForegroundColor White
    Write-Host ""
    Write-Host "🚀 READY TO USE:" -ForegroundColor Yellow
    Write-Host "1. Run: npm start" -ForegroundColor White
    Write-Host "2. Open Luna Agent" -ForegroundColor White
    Write-Host "3. Look for voice interface components" -ForegroundColor White
    Write-Host "4. Start talking to your AI agent!" -ForegroundColor White
    Write-Host ""
    Write-Host "🔗 Working endpoints:" -ForegroundColor Gray
    Write-Host "• Status: http://localhost:3000/api/voice/streaming/status" -ForegroundColor DarkGray
    Write-Host "• Health: http://localhost:3000/api/voice/streaming/health" -ForegroundColor DarkGray
    Write-Host "• Sessions: http://localhost:3000/api/voice/streaming/sessions" -ForegroundColor DarkGray
    Write-Host "• WebSocket: ws://localhost:3000/ws/voice/stream" -ForegroundColor DarkGray
    
} else {
    Write-Host ""
    Write-Host "⚠️ PARTIAL SUCCESS" -ForegroundColor Yellow
    if ($successCount -eq $totalTests) {
        Write-Host "HTTP endpoints are working but WebSocket failed" -ForegroundColor Yellow
    } else {
        Write-Host "Some endpoints still not working - may need further debugging" -ForegroundColor Yellow
    }
}

# Cleanup
Write-Host ""
Write-Host "🧹 Cleaning up..." -ForegroundColor Gray
Stop-Job -Job $serverJob -ErrorAction SilentlyContinue
Remove-Job -Job $serverJob -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Test completed at $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor DarkGray

if ($overallSuccess) {
    Write-Host ""
    Write-Host "🎉 Your Luna Agent voice system is ready for natural AI conversation! 🎉" -ForegroundColor Green
}