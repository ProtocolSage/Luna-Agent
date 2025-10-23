@echo off
echo Setting up VS 2019 Build Environment...
call "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
echo.
echo Setting node-gyp Visual Studio configuration...
set npm_config_msvs_version=2019
set GYP_MSVS_VERSION=2019
set npm_config_msbuild_path=C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\MSBuild.exe
echo.
echo Rebuilding better-sqlite3 for Electron...
cd /d C:\dev\luna-agent-v1.0-production-complete-2
set DEBUG=electron-rebuild
npx electron-rebuild -f -w better-sqlite3
echo.
echo Rebuild complete!
pause
