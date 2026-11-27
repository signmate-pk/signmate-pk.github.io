@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run setup_windows.bat once to install the project dependencies first.
  exit /b 1
)
.venv\Scripts\python.exe tools\run_all_tests.py %*
exit /b %errorlevel%
