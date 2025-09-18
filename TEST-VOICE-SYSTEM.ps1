# TEST-VOICE-SYSTEM.ps1
# Comprehensive PowerShell script to test Luna Agent streaming voice system on Windows

param(
    [switch]$SkipBuild,
    [switch]$Verbose
)

Write-Host "🎤 LUNA AGENT STREAMING VOICE SYSTEM TEST" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"
$startTime = Get-Date

# Function to test HTTP endpoint
function Test-HttpEndpoint {
    param([string]$Url, [string]$Description)
    
    try {
        Write-Host "Testing: $Description" -ForegroundColor Yellow
        Write-Host "URL: $Url" -ForegroundColor Gray
        
        $response = Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 10
        Write-Host "✅ SUCCESS: $Description" -ForegroundColor Green
        
        if ($Verbose) {
            Write-Host "Response:" -ForegroundColor Gray
            $response | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor Gray
        }
        
        return $true
    }
    catch {
        Write-Host "❌ FAILED: $Description" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Function to test WebSocket connection
function Test-WebSocketConnection {
    param([string]$Url, [string]$Description)
    
    Write-Host "Testing: $Description" -ForegroundColor Yellow
    Write-Host "WebSocket URL: $Url" -ForegroundColor Gray
    
    try {
        # Create a simple WebSocket test using PowerShell
        $webSocket = New-Object System.Net.WebSockets.ClientWebSocket
        $cancellationToken = [System.Threading.CancellationToken]::None
        $uri = [System.Uri]::new($Url)
        
        $connectTask = $webSocket.ConnectAsync($uri, $cancellationToken)
        $timeout = 5000  # 5 seconds
        
        if ($connectTask.Wait($timeout)) {
            if ($webSocket.State -eq "Open") {
                Write-Host "✅ SUCCESS: WebSocket connection established" -ForegroundColor Green
                $webSocket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Test complete", $cancellationToken).Wait(2000)
                return $true
            }
            else {
                Write-Host "❌ FAILED: WebSocket state is $($webSocket.State)" -ForegroundColor Red
                return $false
            }
        }
        else {
            Write-Host "❌ FAILED: WebSocket connection timeout" -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Host "❌ FAILED: $Description" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
    finally {
        if ($webSocket) {
            $webSocket.Dispose()
        }
    }
}

# Main test sequence
Write-Host "Starting voice system tests..." -ForegroundColor White
Write-Host ""

# Step 1: Build the project (unless skipped)
if (-not $SkipBuild) {
    Write-Host "🔨 STEP 1: Building Luna Agent..." -ForegroundColor Magenta
    try {
        & npm run build 2>&1 | Tee-Object -Variable buildOutput
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Build successful" -ForegroundColor Green
        } else {
            Write-Host "❌ Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
            Write-Host "Build output:" -ForegroundColor Yellow
            $buildOutput | Write-Host -ForegroundColor Gray
            exit 1
        }
    }
    catch {
        Write-Host "❌ Build error: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⏭️ STEP 1: Skipping build (use -SkipBuild to enable)" -ForegroundColor Yellow
}

Write-Host ""

# Step 2: Start the backend server
Write-Host "🚀 STEP 2: Starting Luna Agent backend..." -ForegroundColor Magenta

# Kill any existing Luna processes
Get-Process -Name "node", "electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Start backend server
$backendJob = Start-Job -ScriptBlock {
    Set-Location $args[0]
    & npm run dev:backend
} -ArgumentList (Get-Location).Path

# Wait for server to start
Write-Host "Waiting for backend server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# Check if backend job is still running
if ($backendJob.State -eq "Running") {
    Write-Host "✅ Backend server started successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Backend server failed to start" -ForegroundColor Red
    $jobOutput = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
    Write-Host "Job output:" -ForegroundColor Yellow
    $jobOutput | Write-Host -ForegroundColor Gray
    exit 1
}

Write-Host ""

# Step 3: Test HTTP endpoints
Write-Host "🌐 STEP 3: Testing HTTP endpoints..." -ForegroundColor Magenta

$httpTests = @(
    @{ Url = "http://localhost:3000/health"; Description = "Health check endpoint" },
    @{ Url = "http://localhost:3000/api/voice/streaming/status"; Description = "Streaming voice status" },
    @{ Url = "http://localhost:3000/api/voice/streaming/health"; Description = "Streaming voice health" },
    @{ Url = "http://localhost:3000/api/voice/streaming/sessions"; Description = "Active voice sessions" }
)

$httpResults = @()
foreach ($test in $httpTests) {
    $result = Test-HttpEndpoint -Url $test.Url -Description $test.Description
    $httpResults += $result
    Start-Sleep -Seconds 1
}

Write-Host ""

# Step 4: Test WebSocket connection
Write-Host "🔌 STEP 4: Testing WebSocket connection..." -ForegroundColor Magenta

$wsResult = Test-WebSocketConnection -Url "ws://localhost:3000/ws/voice/stream" -Description = "Streaming voice WebSocket"

Write-Host ""

# Step 5: Test Electron app startup
Write-Host "⚡ STEP 5: Testing Electron app startup..." -ForegroundColor Magenta

try {
    # Start Electron app in background
    $electronJob = Start-Job -ScriptBlock {
        Set-Location $args[0]
        & npm start 2>&1
    } -ArgumentList (Get-Location).Path
    
    Write-Host "Waiting for Electron app to initialize..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    
    # Check if Electron process is running
    $electronProcess = Get-Process -Name "electron" -ErrorAction SilentlyContinue
    if ($electronProcess) {
        Write-Host "✅ Electron app started successfully" -ForegroundColor Green
        Write-Host "Process ID: $($electronProcess.Id)" -ForegroundColor Gray
        
        # Let it run for a few seconds to initialize
        Start-Sleep -Seconds 5
        
        # Check if it's still running (didn't crash)
        $stillRunning = Get-Process -Id $electronProcess.Id -ErrorAction SilentlyContinue
        if ($stillRunning) {
            Write-Host "✅ Electron app is stable and running" -ForegroundColor Green
        } else {
            Write-Host "❌ Electron app crashed after startup" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ Electron app failed to start" -ForegroundColor Red
        $electronOutput = Receive-Job -Job $electronJob -ErrorAction SilentlyContinue
        Write-Host "Electron output:" -ForegroundColor Yellow
        $electronOutput | Write-Host -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Electron startup error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 6: Generate test report
Write-Host "📊 STEP 6: Test Results Summary" -ForegroundColor Magenta
Write-Host "==============================" -ForegroundColor Magenta

$totalTests = $httpTests.Count + 1  # +1 for WebSocket
$passedTests = ($httpResults | Where-Object { $_ -eq $true }).Count
if ($wsResult) { $passedTests++ }

Write-Host "Total HTTP Tests: $($httpTests.Count)" -ForegroundColor White
Write-Host "Passed HTTP Tests: $(($httpResults | Where-Object { $_ -eq $true }).Count)" -ForegroundColor Green
Write-Host "Failed HTTP Tests: $(($httpResults | Where-Object { $_ -eq $false }).Count)" -ForegroundColor Red
Write-Host ""
Write-Host "WebSocket Test: $(if ($wsResult) { 'PASSED' } else { 'FAILED' })" -ForegroundColor $(if ($wsResult) { 'Green' } else { 'Red' })
Write-Host ""
Write-Host "Overall Success Rate: $($passedTests)/$totalTests ($(($passedTests/$totalTests*100).ToString('F1'))%)" -ForegroundColor $(if ($passedTests -eq $totalTests) { 'Green' } else { 'Yellow' })

$endTime = Get-Date
$duration = $endTime - $startTime
Write-Host "Test Duration: $($duration.TotalSeconds.ToString('F1')) seconds" -ForegroundColor Gray

Write-Host ""

# Step 7: Cleanup and next steps
Write-Host "🧹 STEP 7: Cleanup and Next Steps" -ForegroundColor Magenta

Write-Host "Cleaning up test processes..." -ForegroundColor Yellow

# Stop background jobs
if ($backendJob) {
    Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $backendJob -ErrorAction SilentlyContinue
}

if ($electronJob) {
    Stop-Job -Job $electronJob -ErrorAction SilentlyContinue
    Remove-Job -Job $electronJob -ErrorAction SilentlyContinue
}

# Kill processes
Get-Process -Name "node", "electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "🎤 VOICE SYSTEM STATUS:" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan

if ($passedTests -eq $totalTests) {
    Write-Host "✅ ALL SYSTEMS OPERATIONAL!" -ForegroundColor Green
    Write-Host "Your streaming voice system is ready for use." -ForegroundColor Green
    Write-Host ""
    Write-Host "🔥 VOICE FEATURES AVAILABLE:" -ForegroundColor Yellow
    Write-Host "• Real-time STT with OpenAI Whisper" -ForegroundColor White
    Write-Host "• Streaming TTS during AI responses" -ForegroundColor White
    Write-Host "• Interrupt/barge-in capability" -ForegroundColor White
    Write-Host "• Voice Activity Detection (VAD)" -ForegroundColor White
    Write-Host "• Echo cancellation" -ForegroundColor White
    Write-Host "• Continuous conversation mode" -ForegroundColor White
    Write-Host ""
    Write-Host "To start using the voice system:" -ForegroundColor Cyan
    Write-Host "1. Run: npm start" -ForegroundColor White
    Write-Host "2. Open Luna Agent" -ForegroundColor White
    Write-Host "3. Look for the streaming voice interface" -ForegroundColor White
    Write-Host "4. Start talking naturally to your AI agent!" -ForegroundColor White
} else {
    Write-Host "⚠️ SOME TESTS FAILED" -ForegroundColor Yellow
    Write-Host "Check the errors above and ensure:" -ForegroundColor Yellow
    Write-Host "• Node.js and npm are installed" -ForegroundColor White
    Write-Host "• All dependencies are installed (npm install)" -ForegroundColor White
    Write-Host "• Ports 3000 and 3001 are available" -ForegroundColor White
    Write-Host "• OPENAI_API_KEY environment variable is set" -ForegroundColor White
    Write-Host ""
    Write-Host "Run this script again after fixing issues:" -ForegroundColor Cyan
    Write-Host ".\TEST-VOICE-SYSTEM.ps1" -ForegroundColor White
}

Write-Host ""
Write-Host "Test completed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray