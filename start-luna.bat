@echo off
echo Starting Luna Agent Production...
echo.

REM Start backend server in a new window
echo Starting backend server...
start "Luna Backend" cmd /c "cd /d %~dp0 && npm run backend"

REM Wait a moment for backend to start
timeout /t 3 /nobreak > nul

REM Start Electron app
echo Starting Electron app...
cd /d %~dp0
npx electron dist\app\main\main.js

echo.
echo Application closed.
pause
