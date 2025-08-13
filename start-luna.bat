@echo off
echo =====================================
echo    LUNA VOICE AGENT - PERSONAL
echo =====================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Check if .env file exists
if not exist .env (
    echo ERROR: .env file not found!
    echo Please create .env with your API keys
    echo Copy .env.example to .env and add your keys
    pause
    exit /b 1
)

REM Check for required API keys
findstr /C:"OPENAI_API_KEY=" .env >nul 2>nul
if %errorlevel% neq 0 (
    echo WARNING: OPENAI_API_KEY not found in .env
)

findstr /C:"ANTHROPIC_API_KEY=" .env >nul 2>nul
if %errorlevel% neq 0 (
    echo WARNING: ANTHROPIC_API_KEY not found in .env
)

echo [✓] Configuration verified
echo.

REM Install dependencies if needed
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)
echo [✓] Dependencies installed
echo.

REM Create necessary directories
if not exist memory mkdir memory
if not exist uploads mkdir uploads
if not exist logs mkdir logs
if not exist cache mkdir cache
echo [✓] Directories created
echo.

REM Build if needed
if not exist dist (
    echo Building Luna...
    call npm run build
    if %errorlevel% neq 0 (
        echo ERROR: Build failed
        pause
        exit /b 1
    )
)
echo [✓] Luna built successfully
echo.

echo =====================================
echo    Starting Luna Voice Agent...
echo =====================================
echo.
echo [i] Voice activation: Say "Hey Luna"
echo [i] Manual activation: Click microphone
echo [i] Web interface: http://localhost:3000
echo.
echo Press Ctrl+C to stop
echo.

REM Start Luna
call npm start