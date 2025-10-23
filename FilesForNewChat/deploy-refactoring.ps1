# Luna Agent Refactoring Deployment Script
# This script applies all refactoring changes to your project

$ErrorActionPreference = "Stop"
$ProjectRoot = "C:\dev\luna-agent-v1.0-production-complete-2"

Write-Host "🚀 Luna Agent Refactoring Deployment" -ForegroundColor Cyan
Write-Host "====================================`n" -ForegroundColor Cyan

# Check if project directory exists
if (-not (Test-Path $ProjectRoot)) {
    Write-Host "❌ Project directory not found: $ProjectRoot" -ForegroundColor Red
    Write-Host "Please update the `$ProjectRoot variable in this script." -ForegroundColor Yellow
    exit 1
}

Set-Location $ProjectRoot
Write-Host "📁 Working directory: $ProjectRoot`n" -ForegroundColor Green

# Create backup directory
$BackupDir = Join-Path $ProjectRoot "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
Write-Host "💾 Backup directory created: $BackupDir`n" -ForegroundColor Yellow

# Function to backup and copy file
function Deploy-File {
    param(
        [string]$SourceFile,
        [string]$DestPath,
        [string]$Description
    )
    
    Write-Host "📄 Deploying: $Description" -ForegroundColor Cyan
    
    # Create destination directory if it doesn't exist
    $DestDir = Split-Path $DestPath -Parent
    if (-not (Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
        Write-Host "   📁 Created directory: $DestDir" -ForegroundColor Gray
    }
    
    # Backup existing file
    if (Test-Path $DestPath) {
        $BackupPath = Join-Path $BackupDir (Split-Path $DestPath -Leaf)
        Copy-Item $DestPath $BackupPath -Force
        Write-Host "   💾 Backed up existing file" -ForegroundColor Gray
    }
    
    # Copy new file
    Copy-Item $SourceFile $DestPath -Force
    Write-Host "   ✅ Deployed to: $DestPath`n" -ForegroundColor Green
}

# Create necessary directories
Write-Host "📁 Creating directory structure..." -ForegroundColor Cyan
$Directories = @(
    "src/utils",
    "src/components",
    "src/services",
    "scripts",
    "logs"
)

foreach ($Dir in $Directories) {
    $FullPath = Join-Path $ProjectRoot $Dir
    if (-not (Test-Path $FullPath)) {
        New-Item -ItemType Directory -Path $FullPath -Force | Out-Null
        Write-Host "   ✅ Created: $Dir" -ForegroundColor Green
    }
}
Write-Host ""

# Deploy files
Write-Host "📦 Deploying files...`n" -ForegroundColor Cyan

# Utility files
Deploy-File "logger.ts" "src/utils/logger.ts" "Logger utility"

# Components
Deploy-File "ErrorBoundary.tsx" "src/components/ErrorBoundary.tsx" "Error boundary component"
Deploy-File "ConversationView.tsx" "src/components/ConversationView.tsx" "Conversation view component"
Deploy-File "VoiceControl.tsx" "src/components/VoiceControl.tsx" "Voice control component"

# Services
Deploy-File "WakeWordListener.ts" "src/services/WakeWordListener.ts" "Wake word listener service"

# Main app
Deploy-File "LuxuryApp.tsx" "src/LuxuryApp.tsx" "Main app component"

# Scripts
Deploy-File "rebuild.js" "scripts/rebuild.js" "Database rebuild script"
Deploy-File "copy-assets.js" "scripts/copy-assets.js" "Wake word assets script"
Deploy-File "update-package.js" "scripts/update-package.js" "Package.json updater"

# Config
Deploy-File "webpack.optimization.js" "webpack.optimization.js" "Webpack optimization config"

# Update package.json
Write-Host "📝 Updating package.json scripts..." -ForegroundColor Cyan
node scripts/update-package.js

# Clear NODE_OPTIONS environment variable
Write-Host "`n🧹 Clearing NODE_OPTIONS environment variable..." -ForegroundColor Cyan
[Environment]::SetEnvironmentVariable('NODE_OPTIONS', $null, 'User')
[Environment]::SetEnvironmentVariable('NODE_OPTIONS', $null, 'Machine')
Write-Host "   ✅ Environment cleaned`n" -ForegroundColor Green

# Install dependencies if needed
Write-Host "📦 Checking dependencies..." -ForegroundColor Cyan
$PackageJson = Get-Content "package.json" | ConvertFrom-Json
$RequiredDeps = @(
    "@picovoice/porcupine-web",
    "better-sqlite3"
)

$MissingDeps = @()
foreach ($Dep in $RequiredDeps) {
    if (-not $PackageJson.dependencies.$Dep -and -not $PackageJson.devDependencies.$Dep) {
        $MissingDeps += $Dep
    }
}

if ($MissingDeps.Count -gt 0) {
    Write-Host "   📥 Installing missing dependencies..." -ForegroundColor Yellow
    npm install $MissingDeps --save
} else {
    Write-Host "   ✅ All dependencies present`n" -ForegroundColor Green
}

# Rebuild native modules
Write-Host "🔧 Rebuilding native modules..." -ForegroundColor Cyan
npm run rebuild

# Copy wake word assets
Write-Host "`n📦 Copying wake word assets..." -ForegroundColor Cyan
npm run copy-assets

# Summary
Write-Host "`n" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "📋 What was done:" -ForegroundColor Cyan
Write-Host "  ✅ Created backup in: $BackupDir" -ForegroundColor Gray
Write-Host "  ✅ Deployed logger utility" -ForegroundColor Gray
Write-Host "  ✅ Deployed React components (ErrorBoundary, ConversationView, VoiceControl)" -ForegroundColor Gray
Write-Host "  ✅ Updated WakeWordListener service" -ForegroundColor Gray
Write-Host "  ✅ Deployed simplified LuxuryApp" -ForegroundColor Gray
Write-Host "  ✅ Added build scripts" -ForegroundColor Gray
Write-Host "  ✅ Configured webpack optimization" -ForegroundColor Gray
Write-Host "  ✅ Rebuilt native modules" -ForegroundColor Gray
Write-Host "  ✅ Copied wake word assets" -ForegroundColor Gray
Write-Host "  ✅ Cleared NODE_OPTIONS environment variable" -ForegroundColor Gray
Write-Host ""
Write-Host "🚀 Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review the changes in your editor" -ForegroundColor Gray
Write-Host "  2. Update your webpack.config.js to import webpack.optimization.js" -ForegroundColor Gray
Write-Host "  3. Replace console.log calls with logger.info/warn/error" -ForegroundColor Gray
Write-Host "  4. Test the application: npm start" -ForegroundColor Gray
Write-Host "  5. Check logs/luna.log for any issues" -ForegroundColor Gray
Write-Host ""
Write-Host "📝 If you encounter issues:" -ForegroundColor Yellow
Write-Host "  - Restore from backup: $BackupDir" -ForegroundColor Gray
Write-Host "  - Check logs/luna.log for error details" -ForegroundColor Gray
Write-Host "  - Run 'npm run rebuild' if database issues persist" -ForegroundColor Gray
Write-Host ""
