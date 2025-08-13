@echo off
title Luna Voice Agent - Setup & Start

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║                                          ║
echo  ║         LUNA VOICE AGENT                 ║
echo  ║         Personal Assistant               ║
echo  ║                                          ║
echo  ╚══════════════════════════════════════════╝
echo.

REM Check for .env file
if not exist .env (
    echo [!] No .env file found. Creating from template...
    if exist .env.example.personal (
        copy .env.example.personal .env
        echo.
        echo ================================================
        echo   IMPORTANT: Edit .env and add your API keys!
        echo ================================================
        echo.
        echo   Required keys:
        echo   - OPENAI_API_KEY
        echo   - ANTHROPIC_API_KEY
        echo.
        echo   Press any key to open .env in notepad...
        pause >nul
        notepad .env
        echo.
        echo   After adding your keys, press any key to continue...
        pause >nul
    ) else (
        echo [ERROR] No .env template found!
        pause
        exit /b 1
    )
)

REM Run verification
echo.
echo [*] Running system verification...
echo.
call node verify-setup.js
if %errorlevel% neq 0 (
    echo.
    echo [!] Verification found issues. Attempting to fix...
)

REM Install dependencies if needed
if not exist node_modules (
    echo.
    echo [*] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Build if needed
if not exist dist (
    echo.
    echo [*] Building Luna...
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERROR] Build failed
        echo        Try running: npm install
        pause
        exit /b 1
    )
)

REM Create necessary directories
if not exist memory mkdir memory
if not exist uploads mkdir uploads
if not exist logs mkdir logs
if not exist cache mkdir cache

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║         LUNA IS READY TO START!          ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Voice Commands:
echo  - Say "Hey Luna" to activate
echo  - Or press and hold SPACE bar
echo  - Or click the microphone button
echo.
echo  Web Interface: http://localhost:3000
echo.
echo  Starting Luna in 3 seconds...
timeout /t 3 /nobreak >nul

REM Start Luna
echo.
echo [*] Starting Luna Voice Agent...
echo.
call npm start

REM If Luna exits
echo.
echo Luna has stopped.
pause