@echo off
echo =====================================
echo  LUNA VOICE ASSISTANT - DEPLOYMENT
echo =====================================
echo.

REM Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed
    echo Please install from https://nodejs.org/
    pause
    exit /b 1
)

cd /d "C:\dev\luna-agent-v1.0-production-complete-2"

echo [1/5] Checking environment variables...
if not exist .env (
    echo ERROR: .env file not found
    echo Creating from template...
    copy .env.example .env
    echo Please edit .env with your API keys
    pause
)

REM Verify API keys
for /f "tokens=2 delims==" %%a in ('findstr "OPENAI_API_KEY" .env') do set OPENAI_KEY=%%a
if "%OPENAI_KEY%"=="" (
    echo WARNING: OPENAI_API_KEY not set in .env
)

for /f "tokens=2 delims==" %%a in ('findstr "ELEVEN_API_KEY" .env') do set ELEVEN_KEY=%%a
if "%ELEVEN_KEY%"=="" (
    echo WARNING: ELEVEN_API_KEY not set in .env
)

echo [2/5] Installing dependencies...
call npm install

echo [3/5] Building application...
call npm run build

echo [4/5] Clearing ports...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    echo Killing process on port 3000...
    taskkill /F /PID %%a >nul 2>nul
)

echo [5/5] Starting Luna Voice Assistant...
echo.
echo =====================================
echo  LUNA IS READY!
echo =====================================
echo.
echo INSTRUCTIONS:
echo  1. Luna window will open automatically
echo  2. Click anywhere to activate voice
echo  3. Say "Luna" or just start talking
echo  4. Luna will respond naturally
echo.
echo FEATURES:
echo  - Continuous conversation (no buttons)
echo  - Voice activity detection
echo  - Tool execution (files, web, memory)
echo  - OpenAI GPT-4 intelligence
echo  - Natural TTS voice
echo.
echo Press Ctrl+C to stop
echo =====================================
echo.

npm run dev
