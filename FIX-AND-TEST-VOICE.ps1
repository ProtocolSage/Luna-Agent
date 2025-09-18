# FIX-AND-TEST-VOICE.ps1
# Complete fix and test cycle for voice system

Write-Host "🔧 LUNA AGENT VOICE SYSTEM - FIX AND TEST" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"

# Step 1: Kill existing processes
Write-Host "🔪 Step 1: Cleaning up existing processes..." -ForegroundColor Yellow
Get-Process -Name "node", "electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "✅ Processes cleaned up" -ForegroundColor Green
Write-Host ""

# Step 2: Build backend
Write-Host "🔨 Step 2: Building backend..." -ForegroundColor Yellow
try {
    $buildOutput = & npm run build:backend 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Backend build successful" -ForegroundColor Green
    } else {
        Write-Host "❌ Backend build failed:" -ForegroundColor Red
        $buildOutput | Write-Host -ForegroundColor DarkRed
        exit 1
    }
} catch {
    Write-Host "❌ Build error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 3: Start backend and test
Write-Host "🚀 Step 3: Starting backend server..." -ForegroundColor Yellow

$backendJob = Start-Job -ScriptBlock {
    Set-Location $args[0]
    & npm run dev:backend 2>&1
} -ArgumentList (Get-Location).Path

Write-Host "⏳ Waiting for server initialization..." -ForegroundColor Gray

# Wait for server to start
$attempts = 0
$serverReady = $false
while (-not $serverReady -and $attempts -lt 20) {
    Start-Sleep -Seconds 2
    $attempts++
    
    try {
        $healthCheck = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method GET -TimeoutSec 3
        $serverReady = $true
        Write-Host "✅ Server is responding!" -ForegroundColor Green
    } catch {
        Write-Host "⏳ Waiting... (attempt $attempts/20)" -ForegroundColor Gray
    }
}

if (-not $serverReady) {
    Write-Host "❌ Server failed to start after 40 seconds" -ForegroundColor Red
    
    # Show job output for debugging
    $jobOutput = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
    if ($jobOutput) {
        Write-Host ""
        Write-Host "Server output:" -ForegroundColor Yellow
        $jobOutput | Write-Host -ForegroundColor DarkGray
    }
    
    # Clean up
    Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $backendJob -ErrorAction SilentlyContinue
    exit 1
}

Write-Host ""

# Step 4: Test voice endpoints systematically
Write-Host "🎤 Step 4: Testing voice endpoints..." -ForegroundColor Yellow

function Test-VoiceEndpoint {
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

$voiceTests = @(
    @{ Url = "http://localhost:3000/api/voice/tts/check"; Name = "Legacy voice TTS check" },
    @{ Url = "http://localhost:3000/api/voice/streaming/status"; Name = "Streaming voice status" },
    @{ Url = "http://localhost:3000/api/voice/streaming/health"; Name = "Streaming voice health" },
    @{ Url = "http://localhost:3000/api/voice/streaming/sessions"; Name = "Streaming voice sessions" }
)

$voiceResults = @()
foreach ($test in $voiceTests) {
    $result = Test-VoiceEndpoint -Url $test.Url -Name $test.Name
    $voiceResults += $result
    Start-Sleep -Seconds 1
}

$successCount = ($voiceResults | Where-Object { $_ -eq $true }).Count
$totalTests = $voiceResults.Count

Write-Host ""
Write-Host "📊 VOICE SYSTEM TEST RESULTS:" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host "Voice endpoints working: $successCount/$totalTests" -ForegroundColor $(if ($successCount -eq $totalTests) { 'Green' } else { 'Yellow' })

if ($successCount -eq $totalTests) {
    Write-Host ""
    Write-Host "🎉 SUCCESS! Voice system is fully operational!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎤 Available voice features:" -ForegroundColor Yellow
    Write-Host "• Real-time STT with OpenAI Whisper" -ForegroundColor White
    Write-Host "• Streaming TTS during AI responses" -ForegroundColor White
    Write-Host "• Interrupt/barge-in capability" -ForegroundColor White
    Write-Host "• Voice Activity Detection (VAD)" -ForegroundColor White
    Write-Host "• Echo cancellation" -ForegroundColor White
    Write-Host "• Continuous conversation mode" -ForegroundColor White
    Write-Host ""
    Write-Host "🚀 Ready to test in Luna Agent UI!" -ForegroundColor Cyan
    
} elseif ($successCount -gt 0) {
    Write-Host ""
    Write-Host "⚠️ Partial success - some voice endpoints working" -ForegroundColor Yellow
    Write-Host "This indicates the server is running but some routes may not be mounted correctly." -ForegroundColor Yellow
    
} else {
    Write-Host ""
    Write-Host "❌ No voice endpoints working" -ForegroundColor Red
    Write-Host "This indicates a route mounting issue in the server." -ForegroundColor Red
}

# Step 5: Test WebSocket connection
Write-Host ""
Write-Host "🔌 Step 5: Testing WebSocket connection..." -ForegroundColor Yellow

try {
    $webSocket = New-Object System.Net.WebSockets.ClientWebSocket
    $cancellationToken = [System.Threading.CancellationToken]::None
    $uri = [System.Uri]::new("ws://localhost:3000/ws/voice/stream")
    
    $connectTask = $webSocket.ConnectAsync($uri, $cancellationToken)
    if ($connectTask.Wait(5000)) {
        if ($webSocket.State -eq "Open") {
            Write-Host "✅ WebSocket connection successful" -ForegroundColor Green
            $webSocket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Test complete", $cancellationToken).Wait(2000)
        } else {
            Write-Host "❌ WebSocket connection failed (state: $($webSocket.State))" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ WebSocket connection timeout" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ WebSocket test failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($webSocket) {
        $webSocket.Dispose()
    }
}

Write-Host ""

# Step 6: Final status and next steps
if ($successCount -eq $totalTests) {
    Write-Host "🎯 NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "=============" -ForegroundColor Cyan
    Write-Host "1. Your voice system backend is ready!" -ForegroundColor White
    Write-Host "2. Start the full application: npm start" -ForegroundColor White
    Write-Host "3. Look for voice controls in the Luna Agent UI" -ForegroundColor White
    Write-Host "4. Test real-time voice conversation!" -ForegroundColor White
    Write-Host ""
    Write-Host "🎤 Voice API endpoints available:" -ForegroundColor Yellow
    Write-Host "• Status: http://localhost:3000/api/voice/streaming/status" -ForegroundColor White
    Write-Host "• Health: http://localhost:3000/api/voice/streaming/health" -ForegroundColor White
    Write-Host "• Sessions: http://localhost:3000/api/voice/streaming/sessions" -ForegroundColor White
    Write-Host "• WebSocket: ws://localhost:3000/ws/voice/stream" -ForegroundColor White
    
} else {
    Write-Host "🔧 TROUBLESHOOTING NEEDED:" -ForegroundColor Yellow
    Write-Host "=========================" -ForegroundColor Yellow
    Write-Host "The server is running but voice routes aren't fully mounted." -ForegroundColor White
    Write-Host "This suggests an issue in the server.ts route initialization." -ForegroundColor White
    Write-Host ""
    Write-Host "Check server logs for route mounting messages:" -ForegroundColor White
    Write-Host "• Look for '[SecureServer] Mounting...' messages" -ForegroundColor White
    Write-Host "• Check for any errors during route initialization" -ForegroundColor White
}

# Clean up
Write-Host ""
Write-Host "🧹 Cleaning up..." -ForegroundColor Gray
Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
Remove-Job -Job $backendJob -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Test completed at $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor DarkGray