# FIX-ESBUILD-WINDOWS.ps1
# Fix esbuild platform issue for Windows

Write-Host "🔧 FIXING ESBUILD FOR WINDOWS" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔍 Problem: esbuild has Linux binaries but needs Windows binaries" -ForegroundColor Yellow
Write-Host ""

# Step 1: Remove problematic esbuild packages
Write-Host "🗑️ Step 1: Removing incorrect esbuild binaries..." -ForegroundColor Yellow

$linuxPackages = @(
    "@esbuild/linux-x64",
    "@esbuild/linux-arm64",
    "@esbuild/linux-arm",
    "@esbuild/linux-ia32",
    "@esbuild/linux-loong64",
    "@esbuild/linux-mips64el",
    "@esbuild/linux-ppc64",
    "@esbuild/linux-riscv64",
    "@esbuild/linux-s390x"
)

foreach ($pkg in $linuxPackages) {
    Write-Host "Removing $pkg..." -ForegroundColor Gray
    & npm uninstall $pkg 2>$null
}

Write-Host "✅ Linux packages removed" -ForegroundColor Green

# Step 2: Install correct Windows esbuild
Write-Host ""
Write-Host "📦 Step 2: Installing Windows esbuild binary..." -ForegroundColor Yellow

try {
    & npm install @esbuild/win32-x64 --save-dev
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Windows esbuild installed successfully" -ForegroundColor Green
    } else {
        throw "npm install failed"
    }
} catch {
    Write-Host "❌ Failed to install Windows esbuild" -ForegroundColor Red
    Write-Host "Trying alternative approach..." -ForegroundColor Yellow
    
    # Alternative: reinstall esbuild entirely
    & npm uninstall esbuild
    & npm install esbuild --save-dev
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ esbuild reinstalled successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to fix esbuild. Manual intervention needed." -ForegroundColor Red
        exit 1
    }
}

# Step 3: Test the fix
Write-Host ""
Write-Host "🧪 Step 3: Testing esbuild fix..." -ForegroundColor Yellow

try {
    Write-Host "Testing renderer build..." -ForegroundColor Gray
    & npm run build:renderer
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Renderer build successful!" -ForegroundColor Green
        
        # Step 4: Now test voice system
        Write-Host ""
        Write-Host "🎤 Step 4: Testing voice system..." -ForegroundColor Yellow
        Write-Host "Running final voice test..." -ForegroundColor Gray
        
        & .\FINAL-VOICE-TEST.ps1
        
    } else {
        Write-Host "❌ Renderer build still failing" -ForegroundColor Red
        Write-Host ""
        Write-Host "🔧 MANUAL FIX NEEDED:" -ForegroundColor Yellow
        Write-Host "1. Delete node_modules: Remove-Item -Recurse -Force node_modules" -ForegroundColor White
        Write-Host "2. Clean npm cache: npm cache clean --force" -ForegroundColor White  
        Write-Host "3. Reinstall dependencies: npm install" -ForegroundColor White
        Write-Host "4. Try again: npm run build:renderer" -ForegroundColor White
    }
    
} catch {
    Write-Host "❌ Build test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Fix completed at $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray