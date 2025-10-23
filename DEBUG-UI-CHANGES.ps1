# DEBUG-UI-CHANGES.ps1
# Debug script to check if UI changes are actually in the built files

Write-Host "🔍 DEBUGGING UI CHANGES" -ForegroundColor Cyan
Write-Host "=======================" -ForegroundColor Cyan
Write-Host ""

# Check if built renderer files exist
$rendererFile = "dist/app/renderer/renderer.js"
$rendererSize = 0

if (Test-Path $rendererFile) {
    $rendererSize = (Get-Item $rendererFile).Length / 1MB
    Write-Host "✅ Renderer file exists: $rendererFile" -ForegroundColor Green
    Write-Host "   Size: $([math]::Round($rendererSize, 2)) MB" -ForegroundColor Green
    
    # Check when it was last built
    $lastModified = (Get-Item $rendererFile).LastWriteTime
    Write-Host "   Last built: $lastModified" -ForegroundColor Green
    
    # Check if LUNA PRO text is in the built file
    $content = Get-Content $rendererFile -Raw -ErrorAction SilentlyContinue
    if ($content -like "*LUNA PRO*") {
        Write-Host "✅ 'LUNA PRO' text found in built renderer!" -ForegroundColor Green
    } else {
        Write-Host "❌ 'LUNA PRO' text NOT found in built renderer" -ForegroundColor Red
    }
    
    # Check for other UI elements
    if ($content -like "*Enhanced Voice*") {
        Write-Host "✅ 'Enhanced Voice' text found in built renderer!" -ForegroundColor Green
    } else {
        Write-Host "❌ 'Enhanced Voice' text NOT found in built renderer" -ForegroundColor Red
    }
    
} else {
    Write-Host "❌ Renderer file not found: $rendererFile" -ForegroundColor Red
    Write-Host "   You need to run: npm run build:renderer" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📁 CHECKING SOURCE FILES..." -ForegroundColor Cyan

# Check App.tsx to see which component it's loading
$appFile = "app/renderer/App.tsx"
if (Test-Path $appFile) {
    $appContent = Get-Content $appFile -Raw
    Write-Host "✅ App.tsx exists" -ForegroundColor Green
    
    if ($appContent -like "*LuxuryApp*") {
        Write-Host "✅ App.tsx is loading LuxuryApp (correct)" -ForegroundColor Green
    } elseif ($appContent -like "*LunaUI*") {
        Write-Host "❌ App.tsx is loading LunaUI (wrong component)" -ForegroundColor Red
        Write-Host "   Should be loading LuxuryApp instead" -ForegroundColor Yellow
    } else {
        Write-Host "⚠️  App.tsx loading unknown component" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ App.tsx not found" -ForegroundColor Red
}

# Check if LuxuryApp.tsx has the UI changes
$luxuryAppFile = "app/renderer/components/LuxuryApp.tsx"
if (Test-Path $luxuryAppFile) {
    $luxuryContent = Get-Content $luxuryAppFile -Raw
    Write-Host "✅ LuxuryApp.tsx exists" -ForegroundColor Green
    
    if ($luxuryContent -like "*LUNA PRO*") {
        Write-Host "✅ LuxuryApp.tsx contains 'LUNA PRO' text" -ForegroundColor Green
    } else {
        Write-Host "❌ LuxuryApp.tsx does NOT contain 'LUNA PRO' text" -ForegroundColor Red
    }
} else {
    Write-Host "❌ LuxuryApp.tsx not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "🚀 NEXT STEPS:" -ForegroundColor Yellow
Write-Host "===============" -ForegroundColor Yellow

if (Test-Path $rendererFile) {
    if ($rendererSize -gt 1) {
        Write-Host "1. ✅ Renderer is built and large (includes UI changes)" -ForegroundColor Green
        Write-Host "2. 🔄 Try restarting Luna Agent completely:" -ForegroundColor White
        Write-Host "   - Close any running Luna Agent windows" -ForegroundColor White
        Write-Host "   - Stop backend (Ctrl+C)" -ForegroundColor White
        Write-Host "   - Run: npm start" -ForegroundColor White
        Write-Host ""
        Write-Host "3. 🧹 If still not working, try clearing Electron cache:" -ForegroundColor White
        Write-Host "   - Windows: Delete %APPDATA%/Luna Agent folder" -ForegroundColor White
        Write-Host "   - Then restart Luna Agent" -ForegroundColor White
    } else {
        Write-Host "1. ❌ Renderer file is too small - UI changes not included" -ForegroundColor Red
        Write-Host "2. 🔨 Rebuild the renderer:" -ForegroundColor Yellow
        Write-Host "   npm run build:renderer" -ForegroundColor White
    }
} else {
    Write-Host "1. ❌ Renderer not built" -ForegroundColor Red
    Write-Host "2. 🔨 Build the renderer first:" -ForegroundColor Yellow
    Write-Host "   npm run build:renderer" -ForegroundColor White
}

Write-Host ""
Write-Host "Debug completed at $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor DarkGray