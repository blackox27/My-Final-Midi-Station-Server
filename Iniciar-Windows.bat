@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 iniciar.py --open %*
  goto fim
)
where python >nul 2>nul
if not errorlevel 1 (
  python iniciar.py --open %*
  goto fim
)
echo Instale o Python 3.10 ou superior e tente novamente.
echo Na instalacao, marque a opcao de adicionar o Python ao PATH.
:fim
pause
