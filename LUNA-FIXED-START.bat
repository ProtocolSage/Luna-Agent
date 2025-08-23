@echo off
title Luna Agent
cls

echo ========================================
echo          LUNA AGENT STARTUP
echo ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed
    pause
    exit /b 1
)

:: Set environment
set NODE_ENV=development

:: Navigate to project directory
cd /d "%~dp0"

:: Verify setup
echo [*] Verifying setup...
call node verify-setup.js

:: Build if needed
if not exist "dist" (
    echo [*] Building application...
    call npm run build
)

:: Start backend
echo [*] Starting backend server...
start /B node dist/server.js

:: Wait for backend
timeout /t 3 /nobreak >nul

:: Start Electron
echo [*] Starting Luna Agent...
call npx electron dist/app/main/main.js

echo.
echo Luna has stopped.
pause