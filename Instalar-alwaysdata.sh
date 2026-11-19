#!/bin/sh
set -eu
umask 077
midishare_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$midishare_root"
midishare_python=${PYTHON_BIN:-python3}
"$midishare_python" -c 'import sys; sys.exit("Use Python 3.10 ou superior (recomendado 3.12).") if sys.version_info < (3,10) else None'
"$midishare_python" -m venv .venv
.venv/bin/python -m pip install --no-cache-dir -r requirements-publico.txt
printf '%s\n' 'Dependências instaladas. Configure o site como User program.' 'Comando: .venv/bin/python -m servidor.alwaysdata' 'Veja COMECE-AQUI-ALWAYSDATA.md para os campos do painel.'
