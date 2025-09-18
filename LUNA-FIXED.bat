@echo off
echo ========================================
echo  LUNA VOICE ASSISTANT - QUICK FIX
echo ========================================
echo.

cd /d C:\dev\luna-agent-v1.0-production-complete-2

echo [1/4] Compiling fixed TypeScript files...
cmd /c "npx tsc backend\server.ts backend\routes\agent.ts --outDir dist --esModuleInterop --skipLibCheck --allowJs"

echo [2/4] Killing processes on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

echo [3/4] Starting backend...
start "Luna Backend" cmd /c "node dist\backend\server.js"

echo Waiting for backend to start...
timeout /t 5 /nobreak >nul

echo [4/4] Starting frontend...
echo.
echo ========================================
echo  LUNA IS STARTING!
echo ========================================
echo.
echo The Luna window should open shortly.
echo Click anywhere to activate voice.
echo.

start /B cmd /c "npm run electron"

echo.
echo Backend is running in separate window.
echo Press any key when done to stop all.
pause >nul

taskkill /F /IM "node.exe" >nul 2>nul
taskkill /F /IM "electron.exe" >nul 2>nul
