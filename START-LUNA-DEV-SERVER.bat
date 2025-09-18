@echo off
echo ============================================
echo   Luna Agent - Development Server Mode
echo ============================================
echo.
echo Starting Luna Agent with webpack-dev-server...
echo This provides hot-reload for faster development
echo.

REM Check if webpack-dev-server is installed
npm list webpack-dev-server > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo webpack-dev-server is not installed. Installing...
    npm install --save-dev webpack-dev-server html-webpack-plugin
    if %ERRORLEVEL% NEQ 0 (
        echo Failed to install webpack-dev-server
        pause
        exit /b 1
    )
)

REM Set environment variables
set NODE_ENV=development
set ELECTRON_ENABLE_LOGGING=1

REM Build the main process
echo Building main process...
call npm run build:main
if %ERRORLEVEL% NEQ 0 (
    echo Main process build failed
    pause
    exit /b 1
)

REM Build the backend
echo Building backend...
call npm run build:backend
if %ERRORLEVEL% NEQ 0 (
    echo Backend build failed
    pause
    exit /b 1
)

REM Start with dev server
echo.
echo Starting Luna Agent with dev server...
echo - Backend: http://localhost:3000
echo - Renderer Dev Server: http://localhost:5173
echo - Electron will connect to the dev server
echo.
call npm run dev:full

pause
