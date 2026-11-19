"""Redefine a senha de uma conta pelo terminal do operador, sem e-mail."""
import argparse
from getpass import getpass
from pathlib import Path
import sqlite3

from .auth import AuthError, AuthStore


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', required=True, type=Path)
    parser.add_argument('usuario')
    args = parser.parse_args()
    # Não cria um banco vazio se o operador errar a pasta.
    if not (args.data / 'contas.sqlite3').is_file():
        parser.error('Banco de contas não encontrado. Confira --data.')
    try:
        password = getpass('Nova senha (10 a 128 caracteres): ')
        confirmation = getpass('Repita a nova senha: ')
        if password != confirmation:
            parser.error('As senhas não coincidem.')
        user = AuthStore(args.data).set_password(args.usuario, password)
    except (AuthError, OSError, sqlite3.Error) as error:
        parser.exit(1, f'Não foi possível redefinir: {error}\n')
    except (EOFError, KeyboardInterrupt):
        parser.exit(1, '\nOperação cancelada.\n')
    print(f"Senha de {user['username']} atualizada. As sessões anteriores foram encerradas.")


if __name__ == '__main__':
    main()
