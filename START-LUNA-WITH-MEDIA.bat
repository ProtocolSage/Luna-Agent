@echo off
echo Starting Luna Agent with Media Permissions...
echo =====================================
echo.

REM Set environment variables
set NODE_ENV=development
set ELECTRON_ENABLE_LOGGING=1

REM Start the application
cd /d "C:\dev\luna-agent-v1.0-production-complete-2"
call npm run start

pause
