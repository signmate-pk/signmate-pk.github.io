@echo off
rem SignMate: set up this computer for working on the website (for a second laptop, or after a fresh Windows install).
rem   1. checks for Git, Python and Node.js, and offers to install any that are missing (winget)
rem   2. installs the Python and website packages into this folder
rem   3. downloads the pinned model files and the frozen Inference Baseline v1 (sizes and SHA-256 checked)
rem   4. runs the quick test suite
rem Run it from inside the SignMate folder. It needs internet the first time (about 400 MB).
rem Nothing is uploaded. Safe to run again: finished steps are quick the second time.
setlocal
cd /d "%~dp0"
set "LOG=reports\setup_log.txt"
if not exist reports mkdir reports
echo SignMate setup %DATE% %TIME% > "%LOG%"

echo.
echo  SignMate setup
echo  ================
echo.

echo [1/6] Checking Git, Python and Node.js
set "INSTALLED="
call :need git "Git" Git.Git || goto :fail
set "PY="
where py >nul 2>nul && (py -3.12 -c "" >nul 2>nul && set "PY=py -3.12")
if not defined PY where py >nul 2>nul && (py -3.13 -c "" >nul 2>nul && set "PY=py -3.13")
if not defined PY where python >nul 2>nul && (python -c "import sys;raise SystemExit(0 if (3,10)<=sys.version_info[:2]<(3,15) else 1)" >nul 2>nul && set "PY=python")
if not defined PY (
  echo   Python 3.12 is missing.
  call :install Python.Python.3.12 "Python 3.12" || goto :fail
)
call :need node "Node.js" OpenJS.NodeJS.LTS || goto :fail
if defined INSTALLED (
  echo.
  echo   New programs were installed. Windows only sees them in a new window:
  echo   close this window, then double-click setup_windows.bat once more.
  pause
  exit /b 0
)
echo   OK

echo [2/6] Python packages (into the .venv folder here)
if not exist ".venv\Scripts\python.exe" %PY% -m venv .venv >> "%LOG%" 2>&1
if not exist ".venv\Scripts\python.exe" (
  echo   Could not create .venv. See %LOG%
  goto :fail
)
.venv\Scripts\python.exe -m pip install --upgrade pip >> "%LOG%" 2>&1
.venv\Scripts\python.exe -m pip install -r requirements.txt >> "%LOG%" 2>&1 || (echo   pip failed. See %LOG% & goto :fail)
echo   OK

echo [3/6] Website packages
pushd web
call npm install --no-audit --no-fund >> "..\%LOG%" 2>&1 || (popd & echo   npm install failed. See %LOG% & goto :fail)
popd
echo   OK

echo [4/6] Model files (MediaPipe, ASL), checked against their SHA-256
.venv\Scripts\python.exe tools\fetch_assets.py >> "%LOG%" 2>&1 || echo   Some model files did not download; ASL mode may not start. See %LOG%

echo [5/6] Frozen Inference Baseline v1 (about 58 MB, checked against its SHA-256)
.venv\Scripts\python.exe tools\baseline_v1.py restore --download >> "%LOG%" 2>&1 || echo   The baseline did not download. Only the baseline comparison tests need it. See %LOG%

echo [6/6] Quick tests
.venv\Scripts\python.exe tools\run_all_tests.py --smoke >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   Some tests failed. Send %LOG% to Claude.
) else (
  echo   All quick tests passed.
)

echo.
echo  Done. What next:
echo    - start_web.bat          runs the website on this computer for development (http://localhost:5173)
echo    - git pull               gets the newest work (run it in this folder)
echo    - docs\SETUP_NEW_LAPTOP.md explains everything step by step
echo.
pause
exit /b 0

:need
where %1 >nul 2>nul && exit /b 0
echo   %~2 is missing.
call :install %3 "%~2"
exit /b %errorlevel%

:install
where winget >nul 2>nul
if errorlevel 1 (
  echo   Please install %~2 yourself ^(see docs\SETUP_NEW_LAPTOP.md^), then run this file again.
  exit /b 1
)
choice /m "  Install %~2 now with winget"
if errorlevel 2 exit /b 1
winget install --id %1 -e --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo   winget could not install %~2. Install it yourself, then run this file again.
  exit /b 1
)
echo   %~2 installed.
set "INSTALLED=1"
exit /b 0

:fail
echo.
echo  Setup stopped. Read the message above, fix it, and double-click setup_windows.bat again.
pause
exit /b 1
