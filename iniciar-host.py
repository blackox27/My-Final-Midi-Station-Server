"""Inicializador do host pessoal em Windows, Linux e macOS."""
import runpy
import sys
if sys.version_info < (3, 10):
    raise SystemExit('Instale Python 3.10 ou superior.')
runpy.run_module('servidor.host', run_name='__main__')
