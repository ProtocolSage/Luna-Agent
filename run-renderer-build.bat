@echo off
cd /d C:\dev\luna-agent-v1.0-production-complete-2
echo Running renderer build...
npm run build:renderer > renderer-build.log 2>&1
echo Build complete. Check renderer-build.log for output.
type renderer-build.log
