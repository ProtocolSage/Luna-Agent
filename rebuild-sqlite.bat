@echo off
echo Rebuilding better-sqlite3 for Electron 28.3.2...
cd C:\dev\luna-agent-v1.0-production-complete-2
npx electron-rebuild -f -w better-sqlite3 -v 28.3.2 --module-dir C:\dev\luna-agent-v1.0-production-complete-2
echo Rebuild complete!
