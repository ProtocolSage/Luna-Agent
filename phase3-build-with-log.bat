@echo off
cd /d C:\dev\luna-agent-v1.0-production-complete-2

echo [Phase 3] Starting Production Build with logging...
echo Output will be saved to build-output.log
echo.

echo [Step 1/4] Cleaning dist directories...
rmdir /s /q dist 2>nul
rmdir /s /q dist-electron 2>nul
echo Clean complete.
echo.

echo [Step 2/4] Running npm run dist...
echo This may take 10-15 minutes...
echo.

REM Run build and capture ALL output (stdout and stderr)
npm run dist > build-output.log 2>&1

echo.
echo [Step 3/4] Checking results...
echo.

if exist "dist-electron\Luna-Agent-Setup-1.0.2.exe" (
    echo SUCCESS: Installer created!
    dir "dist-electron\Luna-Agent-Setup-1.0.2.exe"
) else (
    echo ERROR: Installer NOT created
    echo.
    echo Showing last 50 lines of build log:
    echo ========================================
    powershell -Command "Get-Content build-output.log -Tail 50"
    echo ========================================
)

echo.
echo Full build log saved to: build-output.log
echo.
echo Press any key to exit...
pause >nul
