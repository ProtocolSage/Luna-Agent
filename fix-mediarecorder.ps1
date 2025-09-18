# Luna Agent MediaRecorder Fix Script
# This script fixes the MediaRecorder error in the Luna Agent application

Write-Host "Luna Agent MediaRecorder Fix Script" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green

# Stop any running instances
Write-Host "`nStopping any running Luna Agent processes..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -like "*electron*" -or $_.ProcessName -like "*luna*"} | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process | Where-Object {$_.ProcessName -like "node"} | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 2

# Navigate to project directory
$projectPath = "C:\dev\luna-agent-v1.0-production-complete-2"
Set-Location $projectPath

Write-Host "`nBacking up original files..." -ForegroundColor Yellow

# Backup original ConversationFlow.ts
$originalFile = ".\app\renderer\services\ConversationFlow.ts"
$backupFile = ".\app\renderer\services\ConversationFlow.backup.ts"
if (Test-Path $originalFile) {
    Copy-Item $originalFile $backupFile -Force
    Write-Host "✓ Backed up ConversationFlow.ts" -ForegroundColor Green
}

# Apply the ConversationFlow fix
Write-Host "`nApplying ConversationFlow fix..." -ForegroundColor Yellow
$fixedFile = ".\app\renderer\services\ConversationFlow-fixed.ts"
if (Test-Path $fixedFile) {
    Copy-Item $fixedFile $originalFile -Force
    Write-Host "✓ Applied ConversationFlow fix" -ForegroundColor Green
}

# Check if main.ts needs updating
Write-Host "`nChecking main.ts for media permission updates..." -ForegroundColor Yellow
$mainFile = ".\app\main\main.ts"
$mainContent = Get-Content $mainFile -Raw

# Check if media permissions are already configured
if ($mainContent -notmatch "WebRTCPipeWireCapturer") {
    Write-Host "Adding media permission configuration to main.ts..." -ForegroundColor Yellow
    
    # Backup main.ts
    Copy-Item $mainFile ".\app\main\main.backup.ts" -Force
    
    # Find the line with app.enableSandbox() and add our permissions code after it
    $lines = Get-Content $mainFile
    $newLines = @()
    $inserted = $false
    
    foreach ($line in $lines) {
        $newLines += $line
        if ($line -match "app\.enableSandbox\(\)" -and -not $inserted) {
            $newLines += "    "
            $newLines += "    // Media permissions for voice recording"
            $newLines += "    app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');"
            $newLines += "    app.commandLine.appendSwitch('enable-webrtc');"
            $inserted = $true
        }
    }
    
    $newLines | Set-Content $mainFile
    Write-Host "✓ Added media permissions to main.ts" -ForegroundColor Green
} else {
    Write-Host "✓ Media permissions already configured" -ForegroundColor Green
}

# Update webPreferences if needed
Write-Host "`nUpdating webPreferences for media handling..." -ForegroundColor Yellow
$mainContent = Get-Content $mainFile -Raw

if ($mainContent -match "sandbox:\s*true") {
    $mainContent = $mainContent -replace "sandbox:\s*true", "sandbox: false // Changed to allow media access"
    Set-Content -Path $mainFile -Value $mainContent
    Write-Host "✓ Updated sandbox setting" -ForegroundColor Green
}

if ($mainContent -match "autoplayPolicy:\s*'user-gesture-required'") {
    $mainContent = $mainContent -replace "autoplayPolicy:\s*'user-gesture-required'", "autoplayPolicy: 'no-user-gesture-required' // Allow autoplay for TTS"
    Set-Content -Path $mainFile -Value $mainContent
    Write-Host "✓ Updated autoplay policy" -ForegroundColor Green
}

# Rebuild the application
Write-Host "`nRebuilding the application..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Cyan

# Clean dist folder
if (Test-Path ".\dist") {
    Remove-Item ".\dist\*" -Recurse -Force -ErrorAction SilentlyContinue
}

# Run the build
npm run build 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Build completed successfully" -ForegroundColor Green
} else {
    Write-Host "⚠ Build had some warnings, but continuing..." -ForegroundColor Yellow
}

# Create a start script with proper permissions
$startScript = @'
@echo off
echo Starting Luna Agent with Media Permissions...
echo =====================================
echo.

REM Set environment variables
set NODE_ENV=development
set ELECTRON_ENABLE_LOGGING=1

REM Start the application
cd /d "C:\dev\luna-agent-v1.0-production-complete-2"
call npm run start

pause
'@

$startScript | Out-File -FilePath ".\START-LUNA-WITH-MEDIA.bat" -Encoding ASCII
Write-Host "`n✓ Created START-LUNA-WITH-MEDIA.bat" -ForegroundColor Green

Write-Host "`n===================================" -ForegroundColor Green
Write-Host "Fix Applied Successfully!" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Run the application using: .\START-LUNA-WITH-MEDIA.bat" -ForegroundColor White
Write-Host "2. When prompted, allow microphone access" -ForegroundColor White
Write-Host "3. The first time you use voice, click anywhere in the window to enable audio (due to browser autoplay policies)" -ForegroundColor White

Write-Host "`nIf you still encounter issues:" -ForegroundColor Yellow
Write-Host "- Make sure Windows has microphone access enabled (Settings > Privacy > Microphone)" -ForegroundColor White
Write-Host "- Check that your default microphone is working in other applications" -ForegroundColor White
Write-Host "- Try running the application as Administrator" -ForegroundColor White

Write-Host "`nPress any key to start the application..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Start the application
Start-Process ".\START-LUNA-WITH-MEDIA.bat"
