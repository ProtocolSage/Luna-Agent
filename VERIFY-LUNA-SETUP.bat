@echo off
echo ============================================
echo   Luna Agent - Setup Verification
echo ============================================
echo.

echo Checking environment...
echo.

REM Check Node.js
node --version > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    pause
    exit /b 1
)
echo [OK] Node.js is installed: 
node --version

REM Check npm
npm --version > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed or not in PATH
    pause
    exit /b 1
)
echo [OK] npm is installed: v
npm --version

REM Check if main files exist
echo.
echo Checking source files...
if exist "app\main\main.ts" (
    echo [OK] Main process source found
) else (
    echo [ERROR] app\main\main.ts not found
)

if exist "app\renderer\index.html" (
    echo [OK] Renderer HTML found
) else (
    echo [ERROR] app\renderer\index.html not found
)

if exist "assets\icon.ico" (
    echo [OK] Windows icon found
) else (
    echo [WARNING] assets\icon.ico not found - icon may not display
)

REM Check if webpack-dev-server is installed
echo.
echo Checking dependencies...
npm list webpack-dev-server > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] webpack-dev-server not installed
    echo          Run: npm install --save-dev webpack-dev-server html-webpack-plugin
) else (
    echo [OK] webpack-dev-server is installed
)

REM Check if builds exist
echo.
echo Checking build outputs...
if exist "dist\app\main\main.js" (
    echo [OK] Main process is built
) else (
    echo [INFO] Main process not built - will build on start
)

if exist "dist\backend\server.js" (
    echo [OK] Backend is built
) else (
    echo [INFO] Backend not built - will build on start
)

if exist "dist\app\renderer\index.html" (
    echo [OK] Renderer is built
) else (
    echo [INFO] Renderer not built - will build on start
)

echo.
echo ============================================
echo   Setup verification complete!
echo ============================================
echo.
echo Available startup options:
echo.
echo 1. START-LUNA-DEV-SERVER.bat
echo    - Development with hot reload
echo    - Best for active development
echo.
echo 2. START-LUNA-FILE-MODE.bat  
echo    - Production-like with built files
echo    - Best for testing final build
echo.
echo Choose based on your needs!
echo.
pause
