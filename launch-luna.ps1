# Simple Electron Launcher for Luna Agent
$ErrorActionPreference = "Continue"

Set-Location "C:\dev\luna-agent-v1.0-production-complete-2"

Write-Host "Starting Luna Agent..." -ForegroundColor Cyan

# CRITICAL: Remove ELECTRON_RUN_AS_NODE to prevent Node mode
# This environment variable forces Electron to run as Node.js which breaks the Electron API
if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "Removing ELECTRON_RUN_AS_NODE environment variable" -ForegroundColor Yellow
    $env:ELECTRON_RUN_AS_NODE = $null
    Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

# Launch Electron
$electronPath = ".\node_modules\electron\dist\electron.exe"
& $electronPath .
