@echo off
echo ========================================
echo  LUNA QUICK START - FIXED PORTS
echo ========================================
echo.

cd /d C:\dev\luna-agent-v1.0-production-complete-2

echo [1] Killing any processes on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

echo [2] Starting backend server on port 3000...
start /B cmd /c "node dist\backend\server.js"

echo [3] Waiting for backend to initialize...
timeout /t 3 /nobreak >nul

echo [4] Testing backend connection...
curl -s http://localhost:3000/health >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Backend not responding on port 3000
    echo Trying to start backend again...
    start /B cmd /c "npm run backend"
    timeout /t 5 /nobreak >nul
)

echo [5] Starting Electron frontend...
echo.
echo ========================================
echo  LUNA IS STARTING!
echo ========================================
echo.
echo IMPORTANT:
echo  - Backend is running on port 3000
echo  - Frontend will connect to localhost:3000
echo  - Click anywhere in the window to start
echo.
echo If the window doesn't open, press Ctrl+C and try again
echo ========================================
echo.

npm run electron
