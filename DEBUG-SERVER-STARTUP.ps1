# DEBUG-SERVER-STARTUP.ps1
# Debug script to check server startup logs and route mounting

Write-Host "🔍 LUNA AGENT - SERVER STARTUP DEBUGGING" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Kill existing processes
Write-Host "🔪 Cleaning up existing processes..." -ForegroundColor Yellow
Get-Process -Name "node", "electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start backend with full logging
Write-Host "🚀 Starting backend with detailed logging..." -ForegroundColor Yellow

$backendJob = Start-Job -ScriptBlock {
    Set-Location $args[0]
    $env:DEBUG = "express:*"
    & npm run dev:backend 2>&1
} -ArgumentList (Get-Location).Path

Write-Host "⏳ Capturing startup logs..." -ForegroundColor Gray

# Capture logs for analysis
Start-Sleep -Seconds 10

# Get all output from the job
$startupLogs = Receive-Job -Job $backendJob

Write-Host ""
Write-Host "📋 SERVER STARTUP LOGS:" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

if ($startupLogs) {
    # Filter and display relevant log lines
    $routeLines = $startupLogs | Where-Object { $_ -match "Mounting|mounted|routes|SecureServer|listening" }
    
    if ($routeLines) {
        Write-Host "🎯 Route mounting logs:" -ForegroundColor Green
        $routeLines | ForEach-Object {
            if ($_ -match "✅|success") {
                Write-Host "  $($_)" -ForegroundColor Green
            } elseif ($_ -match "❌|error|failed") {
                Write-Host "  $($_)" -ForegroundColor Red
            } else {
                Write-Host "  $($_)" -ForegroundColor White
            }
        }
    } else {
        Write-Host "⚠️ No route mounting logs found!" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "🔍 Error logs:" -ForegroundColor Red
    $errorLines = $startupLogs | Where-Object { $_ -match "error|Error|ERROR|failed|Failed|FAILED" }
    if ($errorLines) {
        $errorLines | ForEach-Object {
            Write-Host "  $($_)" -ForegroundColor Red
        }
    } else {
        Write-Host "  No errors found" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "📝 All startup logs:" -ForegroundColor Gray
    Write-Host "-------------------" -ForegroundColor Gray
    $startupLogs | ForEach-Object {
        Write-Host "  $($_)" -ForegroundColor DarkGray
    }
    
} else {
    Write-Host "❌ No logs captured - server may have failed to start" -ForegroundColor Red
}

Write-Host ""

# Test if server is actually running
Write-Host "🔬 Testing server endpoints..." -ForegroundColor Yellow

try {
    $healthCheck = Invoke-RestMethod -Uri "http://localhost:3001/health" -Method GET -TimeoutSec 5
    Write-Host "✅ Server is responding to health checks" -ForegroundColor Green
    
    # Test a few key endpoints to see what's actually mounted
    $testEndpoints = @(
        "http://localhost:3001/api",
        "http://localhost:3001/api/voice",
        "http://localhost:3001/api/voice/tts/check",
        "http://localhost:3001/api/voice/streaming/status"
    )
    
    Write-Host ""
    Write-Host "🎯 Endpoint availability:" -ForegroundColor Cyan
    foreach ($url in $testEndpoints) {
        try {
            $response = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 3
            Write-Host "  ✅ $url" -ForegroundColor Green
        } catch {
            $statusCode = $_.Exception.Response.StatusCode
            Write-Host "  ❌ $url (HTTP $statusCode)" -ForegroundColor Red
        }
    }
    
} catch {
    Write-Host "❌ Server is not responding" -ForegroundColor Red
}

Write-Host ""
Write-Host "🔧 ANALYSIS AND RECOMMENDATIONS:" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

if ($routeLines -and ($routeLines | Where-Object { $_ -match "streaming" })) {
    Write-Host "✅ Streaming routes are being mounted" -ForegroundColor Green
    Write-Host "Issue may be with route path or handler implementation" -ForegroundColor Yellow
} else {
    Write-Host "❌ Streaming routes are NOT being mounted" -ForegroundColor Red
    Write-Host "Possible issues:" -ForegroundColor Yellow
    Write-Host "• initializeAgentRoutes() method not being called" -ForegroundColor White
    Write-Host "• Error in streamingVoiceRouter import" -ForegroundColor White
    Write-Host "• Exception during route mounting" -ForegroundColor White
}

Write-Host ""

# Check if the compiled route files exist
Write-Host "📁 Checking compiled route files..." -ForegroundColor Yellow
$routeFiles = @(
    "dist/backend/routes/voice.js",
    "dist/backend/routes/streamingVoice.js",
    "dist/backend/server.js"
)

foreach ($file in $routeFiles) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length
        Write-Host "  ✅ $file ($size bytes)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file (missing)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🎯 NEXT STEPS:" -ForegroundColor Cyan

if ($routeLines) {
    Write-Host "1. Review the route mounting logs above" -ForegroundColor White
    Write-Host "2. Look for any errors during initialization" -ForegroundColor White
    Write-Host "3. Check if streaming routes are being mounted at correct path" -ForegroundColor White
} else {
    Write-Host "1. The server is starting but route initialization may be failing" -ForegroundColor White
    Write-Host "2. Check for TypeScript compilation errors" -ForegroundColor White
    Write-Host "3. Verify all route imports are working correctly" -ForegroundColor White
}

# Clean up
Write-Host ""
Write-Host "🧹 Cleaning up..." -ForegroundColor Gray
Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
Remove-Job -Job $backendJob -ErrorAction SilentlyContinue
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue