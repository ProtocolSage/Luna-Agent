@echo off
echo ========================================
echo LUNA AGENT - PHASE 3: PRODUCTION BUILD
echo ========================================
echo.
echo Project: Luna Voice Agent v1.0.2
echo Location: C:\dev\luna-agent-v1.0-production-complete-2
echo.
echo This will:
echo  1. Clean dist directories
echo  2. Run full production build
echo  3. Create Luna-Agent-Setup-1.0.2.exe installer
echo  4. Estimated time: 10-15 minutes
echo.
echo ========================================
echo.

cd /d C:\dev\luna-agent-v1.0-production-complete-2

echo [Step 1/4] Cleaning dist directories...
rmdir /s /q dist 2>nul
rmdir /s /q dist-electron 2>nul
echo Clean complete.
echo.

echo [Step 2/4] Running npm run dist...
echo This may take 10-15 minutes...
echo.
npm run dist

echo.
echo ========================================
echo [Step 3/4] Checking build output...
echo.

if exist "dist-electron\Luna-Agent-Setup-1.0.2.exe" (
    echo SUCCESS: Installer created!
    echo.
    echo Installer location:
    dir "dist-electron\Luna-Agent-Setup-1.0.2.exe"
    echo.
    echo [Step 4/4] Build artifacts:
    dir dist-electron
) else (
    echo ERROR: Installer not found
    echo Check build.log for errors
)

echo.
echo ========================================
echo PHASE 3 COMPLETE
echo ========================================
echo.
pause
