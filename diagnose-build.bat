@echo off
cd /d C:\dev\luna-agent-v1.0-production-complete-2

echo ========================================
echo DIAGNOSING BUILD ISSUE
echo ========================================
echo.

echo [Step 1] Cleaning previous build...
rmdir /s /q dist 2>nul
echo Clean complete.
echo.

echo [Step 2] Running build:backend only...
call npm run build:backend
echo.
if errorlevel 1 (
    echo ERROR: Backend build failed
    pause
    exit /b 1
)

echo [Step 3] Running build:renderer only...
call npm run build:renderer
echo.
if errorlevel 1 (
    echo ERROR: Renderer build failed
    pause
    exit /b 1
)

echo [Step 4] Checking what was created...
echo.
echo === dist/app/renderer contents ===
dir dist\app\renderer
echo.
echo === Checking for critical files ===
if exist "dist\app\renderer\index.html" (
    echo ✅ index.html found
) else (
    echo ❌ index.html MISSING
)

if exist "dist\app\renderer\renderer.js" (
    echo ✅ renderer.js found
) else (
    echo ❌ renderer.js MISSING
)

if exist "dist\app\renderer\renderer.css" (
    echo ✅ renderer.css found
) else (
    echo ❌ renderer.css MISSING
)

if exist "dist\app\renderer\assets" (
    echo ✅ assets folder found
    dir dist\app\renderer\assets
) else (
    echo ❌ assets folder MISSING
)

echo.
echo ========================================
echo DIAGNOSIS COMPLETE
echo ========================================
pause
