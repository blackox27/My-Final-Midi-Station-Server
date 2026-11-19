"""Host pessoal do MIDI Share, com convite para o portal GitHub Pages."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import queue
import re
import shutil
import socket
import subprocess
import threading
import time
from urllib.parse import quote
import webbrowser

from .aplicacao import Application, ROOT, VERSION
from .instancia import DataLease
from .storage import MidiStore
from .server import MidiHTTPServer

PORTAL = 'https://blackox27.github.io/My-Final-Midi-Station-Online/'


def invite(origin):
    return PORTAL + 'conta.html#host=' + quote(origin, safe='')


def default_data():
    legacy = ROOT / 'dados' / 'midis'
    return legacy if (legacy / 'contas.sqlite3').is_file() else Path.home() / 'midishare-data'


class QuickTunnel:
    """Somente transporte HTTPS. As contas ficam no disco do anfitrião."""
    def __init__(self, executable, port):
        self.process = None
        self.executable = executable
        self.port = port

    def start(self):
        lines = queue.Queue(maxsize=256)
        self.process = subprocess.Popen([self.executable, 'tunnel', '--no-autoupdate', '--url',
            f'http://127.0.0.1:{self.port}'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding='utf-8', errors='replace')
        def drain():
            for line in self.process.stdout:
                try:
                    lines.put_nowait(line)
                except queue.Full:
                    pass
        threading.Thread(target=drain, daemon=True).start()
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            try:
                line = lines.get(timeout=.25)
            except queue.Empty:
                if self.process.poll() is not None:
                    raise RuntimeError('O cloudflared encerrou antes de criar o endereço. Confira sua conexão/configuração de túnel.')
                continue
            match = re.search(r'https://[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b', line)
            if match:
                return match[0]
        raise RuntimeError('O túnel não forneceu endereço em 60 segundos. Confira a conexão e a configuração do cloudflared.')

    def close(self):
        if self.process is not None:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=5)
            if self.process.stdout:
                self.process.stdout.close()


def show(origin, data):
    info = {'version': VERSION, 'host': origin, 'portal': PORTAL, 'invite': invite(origin),
            'data': str(data), 'accounts': 'username-password-no-email'}
    # Sem tokens, cookies, senhas ou dados de usuários.
    (data / 'host-info.json').write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\nMIDI Share {VERSION} — HOST\nBiblioteca e contas: {data}\nAbrir host: {origin}\n'
          f'Portal público: {PORTAL}\nConvite pelo portal: {info["invite"]}\n'
          'Cadastros: nome de usuário e senha, sem e-mail.\n'
          'Mantenha este computador e este terminal ligados. Ctrl+C encerra o host.\n', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=default_data())
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--internet', action='store_true', help='Criar túnel HTTPS temporário sem conta Cloudflare')
    parser.add_argument('--open', action='store_true')
    parser.add_argument('--cloudflared', help='Caminho do cloudflared instalado')
    parser.add_argument('--closed-registration', action='store_true', help='Somente contas existentes')
    args = parser.parse_args()
    if not 0 < args.port <= 65535:
        parser.error('Use uma porta entre 1 e 65535.')
    data = args.data.expanduser().resolve()
    tunnel = None
    http = None
    try:
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', args.port))
        with DataLease(data).acquire():
            os.umask(0o077)
            if args.internet:
                try:
                    import uvicorn
                except ImportError:
                    raise RuntimeError('Instale os requisitos: python -m pip install -r requirements-publico.txt')
                executable = args.cloudflared or shutil.which('cloudflared') or shutil.which('cloudflared.exe')
                if not executable:
                    raise RuntimeError('Instale cloudflared primeiro. Consulte COMECE-AQUI-HOST.md. Nenhuma conta de e-mail é necessária para o túnel temporário.')
                tunnel = QuickTunnel(executable, args.port)
                origin = tunnel.start()
                from .publico import PublicServer
                app = Application(MidiStore(data), public_origin=origin,
                                  registration_open=not args.closed_registration)
                server = uvicorn.Server(uvicorn.Config(PublicServer(app, proxy_mode='cloudflare', worker_threads=8),
                    host='127.0.0.1', port=args.port, workers=1, http='h11', ws='none', lifespan='off',
                    proxy_headers=False, access_log=False, server_header=False, limit_concurrency=64,
                    timeout_keep_alive=5, timeout_graceful_shutdown=15))
                def monitor():
                    while not server.should_exit:
                        if tunnel.process.poll() is not None:
                            print('O túnel encerrou. Encerrando o host de internet.', flush=True)
                            server.should_exit = True
                            return
                        time.sleep(1)
                threading.Thread(target=monitor, daemon=True).start()
                show(origin, data)
                if args.open:
                    threading.Timer(1, lambda: webbrowser.open(origin)).start()
                server.run()
            else:
                http = MidiHTTPServer(('127.0.0.1', args.port), MidiStore(data))
                http.registration_open = not args.closed_registration
                origin = f'http://localhost:{args.port}'
                show(origin, data)
                print('Modo local: para outro computador, use o modo Internet ou o servidor de rede com HTTPS.', flush=True)
                if args.open:
                    webbrowser.open(origin)
                http.serve_forever()
    except KeyboardInterrupt:
        pass
    except (OSError, RuntimeError, ValueError) as error:
        parser.exit(1, f'Não foi possível iniciar o host: {error}\n')
    finally:
        if http:
            http.server_close()
        if tunnel:
            tunnel.close()


if __name__ == '__main__':
    main()
