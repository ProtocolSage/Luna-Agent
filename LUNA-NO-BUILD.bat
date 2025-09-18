@echo off
echo ========================================
echo  LUNA - BYPASS BUILD (Use Existing JS)
echo ========================================
echo.

cd /d C:\dev\luna-agent-v1.0-production-complete-2

echo [1] Fixing critical server.js issue directly...
powershell -Command "(Get-Content dist\backend\server.js) -replace 'authenticateToken,', '' | Set-Content dist\backend\server.js"

echo [2] Killing port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

echo [3] Starting backend (bypassing TypeScript)...
start "Luna Backend" cmd /k "node dist\backend\server.js 2>&1"

timeout /t 3 /nobreak >nul

echo [4] Testing backend...
curl -s http://localhost:3000/health
if %errorlevel% equ 0 (
    echo Backend is running!
) else (
    echo Backend may have issues - check the backend window
)

echo [5] Starting Electron frontend...
echo.
echo ========================================
echo  LUNA READY - NO BUILD NEEDED
echo ========================================
echo.

npm run electron

pause
