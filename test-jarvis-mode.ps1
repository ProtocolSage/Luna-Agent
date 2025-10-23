# Test Jarvis Mode - Luna Agent
# This script launches Luna with Jarvis mode fully enabled

$ErrorActionPreference = "Continue"
$projectRoot = "C:\dev\luna-agent-v1.0-production-complete-2"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  🤖 LUNA JARVIS MODE TEST LAUNCHER" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $projectRoot

# Verify environment configuration
Write-Host "[Check] Verifying Jarvis Mode configuration..." -ForegroundColor Yellow

if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw

    $checks = @{
        "WAKE_WORD_ENABLED" = $envContent -match "WAKE_WORD_ENABLED=true"
        "PICOVOICE_ACCESS_KEY" = $envContent -match "PICOVOICE_ACCESS_KEY="
        "VOICE_AUTO_LISTEN" = $envContent -match "VOICE_AUTO_LISTEN=true"
        "CONTINUOUS_CONVERSATION" = $envContent -match "LUNA_CONTINUOUS_CONVERSATION=true"
    }

    foreach ($check in $checks.GetEnumerator()) {
        if ($check.Value) {
            Write-Host "  ✅ $($check.Key)" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $($check.Key) - NOT CONFIGURED" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  ❌ .env file not found!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Verify wake word assets
Write-Host "[Check] Verifying wake word assets..." -ForegroundColor Yellow

$assetPath = "dist\app\renderer\assets\Hey-Luna_en_wasm_v3_0_0.ppn"
if (Test-Path $assetPath) {
    Write-Host "  ✅ Wake word model found: $assetPath" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Wake word model NOT found at: $assetPath" -ForegroundColor Yellow
    Write-Host "     Model should be copied during build process." -ForegroundColor Yellow
}

Write-Host ""

# Verify backend is running
Write-Host "[Check] Checking backend server..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  ✅ Backend server is running on port 3001" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Backend server is NOT running" -ForegroundColor Red
    Write-Host "     Please start backend first: node dist/backend/server.js" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  🚀 LAUNCHING LUNA IN JARVIS MODE" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Features Enabled:" -ForegroundColor Green
Write-Host "  • Wake Word: 'Hey Luna'" -ForegroundColor White
Write-Host "  • Auto-Send Transcriptions" -ForegroundColor White
Write-Host "  • Continuous Conversation" -ForegroundColor White
Write-Host "  • Auto-Listen After Response" -ForegroundColor White
Write-Host ""
Write-Host "How to Use:" -ForegroundColor Yellow
Write-Host "  1. Say 'Hey Luna' to activate (no button press!)" -ForegroundColor White
Write-Host "  2. Speak your question naturally" -ForegroundColor White
Write-Host "  3. Luna responds and auto-resumes listening" -ForegroundColor White
Write-Host "  4. Continue conversation hands-free!" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop Luna at any time" -ForegroundColor Yellow
Write-Host ""

# Remove ELECTRON_RUN_AS_NODE if present
if ($env:ELECTRON_RUN_AS_NODE) {
    $env:ELECTRON_RUN_AS_NODE = $null
    Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

# Launch Electron
$electronPath = "node_modules\electron\dist\electron.exe"

if (Test-Path $electronPath) {
    Write-Host "Starting Electron..." -ForegroundColor Cyan
    Write-Host ""
    & $electronPath . 2>&1 | Write-Host
} else {
    Write-Host "❌ Electron not found at: $electronPath" -ForegroundColor Red
    Write-Host "   Run: npm install" -ForegroundColor Yellow
    exit 1
}
