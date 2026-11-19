"""Inicializa MIDI Share no site User program do alwaysdata, com HTTPS gerenciado."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import ipaddress
import json
import os
from pathlib import Path
import sqlite3

from .aplicacao import Application, ROOT, VERSION, origin_host
from .limites import DiskBudget
from .instancia import DataLease
from .publico import PublicServer
from .storage import MidiStore


def integer(env, name, default, minimum=1, maximum=1_000_000):
    value = env.get(name, str(default))
    if not isinstance(value, str) or not value.isascii() or not value.isdigit():
        raise ValueError(f'{name}: informe um número inteiro positivo.')
    number = int(value) if len(value) < 12 else maximum + 1
    if not minimum <= number <= maximum:
        raise ValueError(f'{name}: use um valor entre {minimum} e {maximum}.')
    return number


@dataclass(frozen=True)
class Settings:
    origin: str
    host: str
    port: int
    data: Path
    max_users: int
    max_files: int
    per_user_bytes: int
    total_bytes: int
    upload_bytes: int
    registration_open: bool

    @classmethod
    def from_env(cls, env):
        origin = env.get('MIDISHARE_PUBLIC_ORIGIN', '')
        hostname = origin_host(origin)
        if not hostname.endswith('.alwaysdata.net'):
            raise ValueError('No perfil alwaysdata, use https://SUA-CONTA.alwaysdata.net, sem caminho.')
        host = env.get('IP', '')
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            raise ValueError('IP: copie o endereço IPv6 fornecido pelo painel do site.')
        # Este perfil confia somente nos cabeçalhos substituídos pelo proxy
        # alwaysdata. Não o use como servidor exposto diretamente na internet.
        if address.version != 6:
            raise ValueError('IP: este perfil exige o endereço IPv6 atribuído pelo alwaysdata (normalmente ::).')
        if address.is_multicast:
            raise ValueError('IP: endereço de escuta inválido.')
        port = integer(env, 'PORT', 0, maximum=65535)
        raw_data = env.get('MIDISHARE_DATA', str(Path.home() / 'midishare-data'))
        data = Path(raw_data).expanduser()
        if not data.is_absolute():
            raise ValueError('MIDISHARE_DATA: use um caminho absoluto.')
        if data.is_symlink() or data.resolve() != data:
            raise ValueError('MIDISHARE_DATA: links simbólicos não são permitidos.')
        data = data.resolve()
        # A instalação pode ser atualizada sem tocar no banco nem na biblioteca.
        if data.is_relative_to(ROOT) or ROOT.is_relative_to(data):
            raise ValueError('MIDISHARE_DATA: escolha uma pasta fora da instalação do programa.')
        registration = env.get('MIDISHARE_REGISTRATION_OPEN', '1')
        if registration not in ('0', '1'):
            raise ValueError('MIDISHARE_REGISTRATION_OPEN: use 1 (aberto) ou 0 (fechado).')
        return cls(
            origin='https://' + hostname, host=str(address), port=port, data=data,
            max_users=integer(env, 'MIDISHARE_MAX_USERS', 20, maximum=100),
            max_files=integer(env, 'MIDISHARE_MAX_FILES', 200, maximum=2000),
            per_user_bytes=integer(env, 'MIDISHARE_USER_MIB', 32, maximum=256) * 1024 * 1024,
            total_bytes=integer(env, 'MIDISHARE_TOTAL_MIB', 256, maximum=768) * 1024 * 1024,
            upload_bytes=integer(env, 'MIDISHARE_UPLOAD_MIB', 8, maximum=8) * 1024 * 1024,
            registration_open=registration == '1',
        )

    def create_app(self):
        self.data.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.data.chmod(0o700)
        budget = DiskBudget(self.data, self.total_bytes)
        store = MidiStore(self.data, self.max_files, self.per_user_bytes, budget=budget)
        app = Application(store, public_origin=self.origin, max_users=self.max_users,
                          max_upload_bytes=self.upload_bytes, upload_slots=1, kdf_slots=1,
                          registration_open=self.registration_open)
        return PublicServer(app, proxy_mode='alwaysdata', worker_threads=4)

    def summary(self):
        return {'version': VERSION, 'origin': self.origin, 'bind': f'[{self.host}]:{self.port}',
                'data': str(self.data), 'max_users': self.max_users, 'max_files_per_user': self.max_files,
                'mib_per_user': self.per_user_bytes // 2**20, 'mib_total': self.total_bytes // 2**20,
                'mib_per_upload': self.upload_bytes // 2**20, 'registration_open': self.registration_open}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Conferir ambiente e disco sem abrir a porta')
    args = parser.parse_args()
    lease = None
    try:
        settings = Settings.from_env(os.environ)
        import uvicorn
        os.umask(0o077)
        if not args.check:
            lease = DataLease(settings.data).acquire()
        application = settings.create_app()
        if args.check:
            with application.app.auth.db() as db:
                db.execute('SELECT 1').fetchone()
            print(json.dumps({**settings.summary(), 'status': 'ok',
                              'data_bytes': application.app.store.budget.used_bytes()}, ensure_ascii=False, indent=2))
            return
    except ImportError:
        parser.exit(1, 'Instale: python -m pip install --no-cache-dir -r requirements-publico.txt\n')
    except (ValueError, OSError, sqlite3.Error) as error:
        if lease:
            lease.close()
        parser.exit(1, f'Não foi possível preparar o site: {error}\n')
    print(f'MIDI Share {VERSION} — {settings.origin} — contas sem e-mail', flush=True)
    try:
        uvicorn.run(application, host=settings.host, port=settings.port, workers=1, http='h11',
                    ws='none', lifespan='off', proxy_headers=False, access_log=False, server_header=False,
                    limit_concurrency=16, backlog=32, timeout_keep_alive=3,
                    timeout_graceful_shutdown=30, h11_max_incomplete_event_size=16 * 1024)
    finally:
        if lease:
            lease.close()


if __name__ == '__main__':
    main()
