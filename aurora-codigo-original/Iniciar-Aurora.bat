@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 iniciar.py
) else (
  python iniciar.py
)
if errorlevel 1 (
  echo Instale Python 3 ou sirva a pasta dist com um servidor HTTP local.
  pause
)
