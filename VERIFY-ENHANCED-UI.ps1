# VERIFY-ENHANCED-UI.ps1
# Script to verify Luna Agent enhanced UI is working

Write-Host "🎯 VERIFYING LUNA AGENT ENHANCED UI" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Check if backend is running
$backendResponse = $null
try {
    $backendResponse = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 5
    if ($backendResponse.StatusCode -eq 200) {
        Write-Host "✅ Backend is running on port 3000" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Backend is NOT running on port 3000" -ForegroundColor Red
    Write-Host "   Please run: npm run dev:backend" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Check if built files are recent and contain UI changes
$rendererFile = "dist/app/renderer/renderer.js"
$appFile = "app/renderer/App.tsx"

Write-Host ""
Write-Host "📁 CHECKING BUILT FILES..." -ForegroundColor Cyan

if (Test-Path $rendererFile) {
    $rendererSize = (Get-Item $rendererFile).Length / 1MB
    $lastModified = (Get-Item $rendererFile).LastWriteTime
    Write-Host "✅ Renderer built: $([math]::Round($rendererSize, 2)) MB" -ForegroundColor Green
    Write-Host "   Last built: $lastModified" -ForegroundColor Green
    
    # Check if enhanced UI is in the build
    $content = Get-Content $rendererFile -Raw -ErrorAction SilentlyContinue
    if ($content -like "*LUNA PRO*") {
        Write-Host "✅ LUNA PRO branding found in built renderer!" -ForegroundColor Green
    } else {
        Write-Host "❌ LUNA PRO branding NOT found in built renderer" -ForegroundColor Red
    }
    
    if ($content -like "*Enhanced Voice*") {
        Write-Host "✅ Enhanced Voice controls found in built renderer!" -ForegroundColor Green
    } else {
        Write-Host "❌ Enhanced Voice controls NOT found in built renderer" -ForegroundColor Red
    }
} else {
    Write-Host "❌ Renderer not built. Run: npm run build:renderer" -ForegroundColor Red
    exit 1
}

# Check App.tsx configuration
Write-Host ""
Write-Host "🔧 CHECKING APP CONFIGURATION..." -ForegroundColor Cyan

if (Test-Path $appFile) {
    $appContent = Get-Content $appFile -Raw
    if ($appContent -like "*LuxuryApp*") {
        Write-Host "✅ App.tsx correctly loads LuxuryApp component" -ForegroundColor Green
    } else {
        Write-Host "❌ App.tsx is NOT loading LuxuryApp component" -ForegroundColor Red
    }
} else {
    Write-Host "❌ App.tsx not found" -ForegroundColor Red
}

# Check if LuxuryApp component exists and has enhancements
$luxuryAppFile = "app/renderer/components/LuxuryApp.tsx"
if (Test-Path $luxuryAppFile) {
    $luxuryContent = Get-Content $luxuryAppFile -Raw
    Write-Host "✅ LuxuryApp component exists" -ForegroundColor Green
    
    if ($luxuryContent -like "*LUNA PRO*") {
        Write-Host "✅ LuxuryApp contains LUNA PRO branding" -ForegroundColor Green
    } else {
        Write-Host "❌ LuxuryApp missing LUNA PRO branding" -ForegroundColor Red
    }
    
    if ($luxuryContent -like "*Enhanced Voice*") {
        Write-Host "✅ LuxuryApp contains Enhanced Voice controls" -ForegroundColor Green
    } else {
        Write-Host "❌ LuxuryApp missing Enhanced Voice controls" -ForegroundColor Red
    }
} else {
    Write-Host "❌ LuxuryApp component not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "🚀 NEXT STEPS:" -ForegroundColor Yellow
Write-Host "===============" -ForegroundColor Yellow

# Check if Electron processes are running
$electronProcess = Get-Process -Name "electron" -ErrorAction SilentlyContinue
if ($electronProcess) {
    Write-Host "✅ Electron is running! Luna Agent should be visible." -ForegroundColor Green
    Write-Host ""
    Write-Host "Look for these enhanced features in the Luna Agent window:" -ForegroundColor White
    Write-Host "  • 🎯 LUNA PRO branding in the header" -ForegroundColor Green
    Write-Host "  • 🎤 Enhanced voice control buttons" -ForegroundColor Green
    Write-Host "  • 📊 Enhancement status banner" -ForegroundColor Green
    Write-Host "  • ✨ Glass morphism design with particle effects" -ForegroundColor Green
    Write-Host ""
    Write-Host "If you don't see these changes:" -ForegroundColor Yellow
    Write-Host "  1. Close Luna Agent completely" -ForegroundColor White
    Write-Host "  2. Clear Electron cache: Delete %APPDATA%\\Luna Agent folder" -ForegroundColor White
    Write-Host "  3. Restart with: npm run dev" -ForegroundColor White
} else {
    Write-Host "❌ Electron is not running" -ForegroundColor Red
    Write-Host ""
    Write-Host "To start Luna Agent with enhanced UI:" -ForegroundColor White
    Write-Host "1. Backend: npm run dev:backend (if not running)" -ForegroundColor White
    Write-Host "2. Frontend: npm run dev" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use the one-command start:" -ForegroundColor White
    Write-Host "npm run dev:full" -ForegroundColor White
}

Write-Host ""
Write-Host "Verification completed at $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor DarkGray