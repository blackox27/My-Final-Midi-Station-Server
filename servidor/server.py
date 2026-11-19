"""MIDI Share: servidor didático para o computador ou a rede local."""
from __future__ import annotations

import argparse
import socket
import sqlite3
import ssl
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from servidor.aplicacao import Application, CHUNK_BYTES, PostPlan, Request, VERSION, error_response
from servidor.auth import AuthError, AuthStore
from servidor.storage import MAX_BYTES, MidiStore


class MidiHTTPServer(ThreadingHTTPServer, Application):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64

    def __init__(self, address, store, web_root=None, max_connections=32):
        Application.__init__(self, store, web_root)
        self._slots = threading.BoundedSemaphore(max_connections)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        if not self._slots.acquire(blocking=False):
            try:
                request.settimeout(1)
                request.sendall(b"HTTP/1.0 503 Service Unavailable\r\nRetry-After: 2\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            except OSError:
                pass
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()


class Handler(BaseHTTPRequestHandler):
    server_version = "MIDIShare/" + VERSION

    def setup(self):
        super().setup()
        self.connection.settimeout(30)
        if isinstance(self.connection, ssl.SSLSocket):
            self.connection.do_handshake()

    def handle(self):
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass

    def log_message(self, format, *args):
        message = "".join(c if c >= " " and c != "\x7f" else "?" for c in format % args)
        sys.stderr.write(f"{self.client_address[0]} - {self.log_date_time_string()} {message}\n")

    def respond(self, response):
        try:
            self.send_response(response.status)
            for key, value in response.headers().items():
                self.send_header(key, value)
            self.end_headers()
            if self.command == "HEAD" or response.status == 304:
                return
            if response.file:
                remaining = response.length
                while remaining and (chunk := response.file.read(min(remaining, CHUNK_BYTES))):
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            elif response.body:
                self.wfile.write(response.body)
        finally:
            response.close()

    def receive(self, plan):
        deadline = time.monotonic() + (120 if plan.upload else 15)
        body = bytearray()
        try:
            while len(body) < plan.length:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError
                self.connection.settimeout(min(30, remaining))
                chunk = self.rfile.read1(min(CHUNK_BYTES, plan.length - len(body)))
                if not chunk:
                    return error_response(400, "Transferência incompleta. Tente novamente.")
                body.extend(chunk)
        except OSError:
            return error_response(408, "Tempo de envio esgotado.")
        finally:
            self.connection.settimeout(30)
        return plan.finish(body)

    def route(self):
        request = Request(self.server, self.command, self.path, self.headers, self.client_address[0],
                          tls=isinstance(self.connection, ssl.SSLSocket))
        response = request.dispatch()
        if isinstance(response, PostPlan):
            if not response.upload:
                response = self.receive(response)
            elif self.server.upload_slots.acquire(timeout=2):
                try:
                    response = self.receive(response)
                finally:
                    self.server.upload_slots.release()
            else:
                response = error_response(503, "Há outros envios em andamento. Tente novamente.")
        self.respond(response)

    do_GET = do_HEAD = do_POST = route


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--data", type=Path, default=ROOT / "dados" / "midis")
    parser.add_argument("--max-files", type=int, default=2000)
    parser.add_argument("--max-total-mib", type=int, default=512)
    parser.add_argument("--open", action="store_true")
    parser.add_argument("--tls-cert", type=Path)
    parser.add_argument("--tls-key", type=Path)
    parser.add_argument("--import-legacy-to", metavar="USUARIO", help="Copiar MIDIs antigos para uma conta e sair")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535 or args.max_files < 1 or args.max_total_mib < 1:
        parser.error("Informe porta entre 0 e 65535 e limites positivos.")
    try:
        store = MidiStore(args.data, args.max_files, args.max_total_mib * 1024 * 1024)
        if args.import_legacy_to:
            auth = AuthStore(args.data)
            user = auth.user(args.import_legacy_to)
            destination = MidiStore(args.data / 'usuarios' / user['id'] / 'midis', args.max_files, args.max_total_mib * 1024 * 1024)
            count = 0
            for item in store.list():
                destination.accept(item['name'], item['source'], store.read(item['id'])[1], 'legacy-' + item['id'])
                count += 1
            print(f"{count} arquivo(s) confirmado(s) na conta {user['username']}. Originais preservados.")
            return
        server = MidiHTTPServer((args.host, args.port), store)
        if bool(args.tls_cert) != bool(args.tls_key):
            parser.error('Informe --tls-cert e --tls-key juntos.')
        if args.tls_cert:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.minimum_version = ssl.TLSVersion.TLSv1_2
            context.load_cert_chain(args.tls_cert, args.tls_key)
            server.socket = context.wrap_socket(server.socket, server_side=True, do_handshake_on_connect=False)
    except (OSError, ValueError, sqlite3.Error) as error:
        parser.exit(1, f"Não foi possível iniciar: {error}\nTente outra porta com --port 8001.\n")
    port = server.server_address[1]
    scheme = "https" if args.tls_cert else "http"
    print(f"\nMIDI SHARE 2.3.1 — servidor ativo\nNeste computador: {scheme}://localhost:{port}\n", flush=True)
    addresses = set()
    try:
        addresses.update(socket.gethostbyname_ex(socket.gethostname())[2])
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("192.0.2.1", 80))
            addresses.add(probe.getsockname()[0])
    except OSError:
        pass
    for address in sorted(addresses):
        if not address.startswith("127."):
            print(f"Possível endereço na rede: {scheme}://{address}:{port}", flush=True)
    print(f"Arquivos: {args.data.resolve()}\nContas privadas ativadas. MIDIs legados: {len(store.list())} (não publicados).\nCtrl+C encerra o servidor.\n", flush=True)
    if args.open:
        import webbrowser
        webbrowser.open(f"{scheme}://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
