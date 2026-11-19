"""Ponto de entrada compatível com Windows, Linux e macOS."""
import sys
from pathlib import Path
import runpy

if sys.version_info < (3, 10):
    raise SystemExit("Este projeto precisa de Python 3.10 ou superior.")
runpy.run_path(str(Path(__file__).resolve().parent / "servidor" / "server.py"), run_name="__main__")
