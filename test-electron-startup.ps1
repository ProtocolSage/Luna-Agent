# Test Electron Startup Script
# This runs Electron from Windows to test if the application starts correctly

$ErrorActionPreference = "Stop"
$projectRoot = "C:\dev\luna-agent-v1.0-production-complete-2"

Write-Host "[Test] Changing to project directory: $projectRoot" -ForegroundColor Cyan
Set-Location $projectRoot

# Check if backend is running
Write-Host "[Test] Checking if backend is running on port 3001..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "[Test] ✓ Backend is running" -ForegroundColor Green
} catch {
    Write-Host "[Test] ✗ Backend is NOT running on port 3001" -ForegroundColor Red
    Write-Host "[Test] Please ensure backend is started from WSL: node dist/backend/server.js" -ForegroundColor Yellow
    exit 1
}

# Check if required files exist
$requiredFiles = @(
    "dist\bootstrap.cjs",
    "dist\app\main\main.js",
    "dist\app\renderer\index.html",
    "dist\app\renderer\renderer.js",
    "node_modules\electron\dist\electron.exe"
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "[Test] ✓ Found: $file" -ForegroundColor Green
    } else {
        Write-Host "[Test] ✗ Missing: $file" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[Test] All required files present" -ForegroundColor Green
Write-Host "[Test] Starting Electron application..." -ForegroundColor Cyan
Write-Host "[Test] Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Start Electron
$electronPath = "node_modules\electron\dist\electron.exe"
& $electronPath . 2>&1 | Write-Host
