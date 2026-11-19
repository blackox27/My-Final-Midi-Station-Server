@echo off
setlocal
cd /d "%~dp0"
if exist .venv\Scripts\python.exe (
  .venv\Scripts\python.exe iniciar-host.py --internet --open %*
) else (
  where py >nul 2>nul
  if not errorlevel 1 (py -3 iniciar-host.py --internet --open %*) else (python iniciar-host.py --internet --open %*)
)
pause
