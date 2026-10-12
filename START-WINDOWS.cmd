@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 LTS from https://nodejs.org/ then try again.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js 24 or newer is required. Please update Node.js.
  pause
  exit /b 1
)
set "HOST=127.0.0.1"
set "PORT=3000"
set "DATA_DIR=%~dp0data"
echo Keep this window open while using Fam Manager.
echo After you see "Fam Manager started on port 3000", open:
echo http://127.0.0.1:3000
echo Press Ctrl+C to stop the application.
echo.
node server.js
pause
