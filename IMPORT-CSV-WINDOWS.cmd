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
set "DATA_DIR=%~dp0data"
echo Close the Fam Manager server window before importing.
echo Select your original Google Sheets CSV in the file picker.
echo Existing data is preserved; duplicate customers are skipped.
echo.
powershell -NoProfile -STA -Command "if (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue) { Write-Host 'Port 3000 is still running. Close Fam Manager and try again.'; exit 1 }; Add-Type -AssemblyName System.Windows.Forms; $picker = New-Object System.Windows.Forms.OpenFileDialog; $picker.Title = 'Select Google Sheets CSV'; $picker.Filter = 'CSV files (*.csv)|*.csv'; if ($picker.ShowDialog() -eq 'OK') { & node 'import-cli.js' $picker.FileName; exit $LASTEXITCODE }"
pause
