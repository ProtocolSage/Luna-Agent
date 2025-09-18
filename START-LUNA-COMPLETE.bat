@echo off
echo ========================================
echo  LUNA VOICE ASSISTANT - COMPLETE START
echo ========================================
echo.

cd /d C:\dev\luna-agent-v1.0-production-complete-2

echo [1/6] Installing any missing dependencies...
cmd /c "npm install zod cheerio node-fetch @types/node --save"

echo [2/6] Building TypeScript files...
cmd /c "npm run build:backend"
if errorlevel 1 (
    echo Build backend failed, trying alternative...
    cmd /c "npx tsc -p tsconfig.backend.json"
)

echo [3/6] Killing any processes on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

echo [4/6] Starting backend server...
start "Luna Backend" cmd /c "node dist\backend\server.js 2>&1 | more"

echo [5/6] Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

echo [6/6] Starting Electron frontend...
echo.
echo ========================================
echo  LUNA IS READY!
echo ========================================
echo.
echo INSTRUCTIONS:
echo  1. The Luna window should open shortly
echo  2. Click anywhere in the window to activate
echo  3. Say "Luna" or just start talking
echo  4. Luna will respond naturally
echo.
echo If you see any errors:
echo  - Check the "Luna Backend" window for backend errors
echo  - Press F12 in Luna window for frontend console
echo.
echo Press Ctrl+C to stop all processes
echo ========================================
echo.

cmd /c "npm run electron"

echo.
echo Luna has stopped. Press any key to exit.
pause >nul
