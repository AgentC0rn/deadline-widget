@echo off
cd /d "%~dp0"
if not exist "%~dp0dist\index.html" (
  call npm run build
)
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  node "%~dp0scripts\ensure-electron.mjs"
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
