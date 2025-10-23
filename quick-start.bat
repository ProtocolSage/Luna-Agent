@echo off
echo ========================================
echo Luna Agent Quick Start Script
echo ========================================
echo.

echo Step 1: Checking for wake word assets...
cd C:\dev\luna-agent-v1.0-production-complete-2

echo.
echo Step 2: Copying wake word assets...
call npm run copy-assets

echo.
echo Step 3: Building the backend...
call npm run build:backend

echo.
echo Step 4: Building the renderer...
call npm run build:renderer

echo.
echo ========================================
echo Build complete!
echo ========================================
echo.
echo Starting Luna Agent...
echo (Note: Database will use in-memory fallback if better-sqlite3 isn't compiled)
echo.
call npm start
