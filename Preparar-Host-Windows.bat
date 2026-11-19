@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (py -3 -m venv .venv) else (python -m venv .venv)
if errorlevel 1 goto fim
.venv\Scripts\python.exe -m pip install -r requirements-publico.txt
:fim
pause
