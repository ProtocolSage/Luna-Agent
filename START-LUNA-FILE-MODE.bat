@echo off
echo ============================================
echo   Luna Agent - File Mode (Production-like)
echo ============================================
echo.
echo Starting Luna Agent with built files...
echo This mode is closer to production behavior
echo.

REM Set environment variables
set NODE_ENV=development
set ELECTRON_ENABLE_LOGGING=1

REM Build everything
echo Building all components...
echo.

echo [1/4] Building main process...
call npm run build:main
if %ERRORLEVEL% NEQ 0 (
    echo Main process build failed
    pause
    exit /b 1
)

echo [2/4] Building backend...
call npm run build:backend
if %ERRORLEVEL% NEQ 0 (
    echo Backend build failed
    pause
    exit /b 1
)

echo [3/4] Building renderer...
call npm run build:renderer
if %ERRORLEVEL% NEQ 0 (
    echo Renderer build failed
    pause
    exit /b 1
)

echo [4/4] Copying assets...
if not exist "dist\assets" mkdir "dist\assets"
copy /Y assets\icon.ico dist\assets\ > nul 2>&1
copy /Y assets\icon.png dist\assets\ > nul 2>&1
echo Assets copied.

REM Start in file mode
echo.
echo Starting Luna Agent in file mode...
echo - Backend: http://localhost:3000
echo - Renderer: Loading from dist/app/renderer/index.html
echo.
call npm run dev:file

pause
