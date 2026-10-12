@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 LTS from https://nodejs.org/ first.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js 24 or newer is required.
  pause
  exit /b 1
)
echo Close Fam Manager before exporting.
echo This tool reads your existing data folder without changing it.
echo It creates a customer backup JSON file beside this launcher.
echo.
node export-backup.cjs
set "FAM_EXPORT_RESULT=%ERRORLEVEL%"
pause
exit /b %FAM_EXPORT_RESULT%
