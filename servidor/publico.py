"""Servidor privado para internet: ASGI em loopback atrás de Caddy com HTTPS."""
from __future__ import annotations

import argparse
import asyncio
import ipaddress
import os
from concurrent.futures import ThreadPoolExecutor
from email.message import Message
from pathlib import Path
from urllib.parse import quote

from .aplicacao import Application, CHUNK_BYTES, PostPlan, Request, error_response, origin_host
from .storage import MidiStore


class PublicServer:
    def __init__(self, app, *, proxy_mode="caddy", worker_threads=None):
        if not app.public_host:
            raise ValueError('Configure a origem HTTPS do servidor privado.')
        if proxy_mode not in ('caddy', 'alwaysdata', 'cloudflare'):
            raise ValueError('Perfil de proxy inválido.')
        self.app = app
        self.proxy_mode = proxy_mode
        self.worker_threads = worker_threads
        self._executor_ready = False

    @staticmethod
    def headers(scope):
        headers = Message()
        for key, value in scope['headers']:
            headers[key.decode('ascii')] = value.decode('latin-1')
        return headers

    def client_ip(self, scope, headers):
        if self.proxy_mode == 'alwaysdata':
            forwarded = headers.get_all('X-Real-IP', [])
            if len(forwarded) != 1:
                raise ValueError('Cabeçalho do proxy ausente.')
            return str(ipaddress.ip_address(forwarded[0]))
        host = (scope.get('client') or ('127.0.0.1',))[0]
        if self.proxy_mode == 'cloudflare':
            forwarded = headers.get_all('CF-Connecting-IP', [])
            if not ipaddress.ip_address(host).is_loopback or len(forwarded) != 1:
                raise ValueError('Cabeçalho do túnel ausente.')
            return str(ipaddress.ip_address(forwarded[0]))
        # O listener só aceita conexões locais. O Caddy substitui esse
        # cabeçalho com o endereço que observou, sem usar X-Forwarded-For.
        try:
            forwarded = headers.get_all('X-MidiShare-Client-IP', [])
            if ipaddress.ip_address(host).is_loopback and len(forwarded) == 1:
                return str(ipaddress.ip_address(forwarded[0]))
        except ValueError:
            pass
        return host

    @staticmethod
    async def run_sync(function, *args):
        # Um cliente desconectado não libera o slot enquanto a gravação ainda
        # executa no thread. Respostas com arquivo aberto também são fechadas.
        task = asyncio.create_task(asyncio.to_thread(function, *args))
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            result = await task
            if hasattr(result, 'close'):
                result.close()
            raise

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return
        if self.worker_threads is not None and not self._executor_ready:
            asyncio.get_running_loop().set_default_executor(
                ThreadPoolExecutor(max_workers=self.worker_threads, thread_name_prefix='midishare'))
            self._executor_ready = True
        method = scope['method']
        headers = self.headers(scope)
        try:
            raw_path = scope.get('raw_path')
            path = raw_path.decode('ascii') if raw_path else quote(scope['path'])
            query = scope['query_string'].decode('ascii')
            target = path + ('?' + query if query else '')
            client_ip = self.client_ip(scope, headers)
            if self.proxy_mode in ('alwaysdata', 'cloudflare') and headers.get_all('X-Forwarded-Proto', []) != ['https']:
                # O painel também deve redirecionar HTTP para HTTPS. Sem esse
                # sinal do proxy, nenhum formulário ou sessão é processado.
                response = error_response(400, 'Use o endereço HTTPS do site.')
            else:
                request = Request(self.app, method, target, headers, client_ip)
                response = await self.run_sync(request.dispatch)
                if isinstance(response, PostPlan):
                    response = await self.receive_post(response, receive)
        except (UnicodeError, ValueError):
            response = error_response(400, 'Endereço ou configuração de proxy inválidos.')
        if response is not None:
            await self.respond(response, method, send)

    async def receive_post(self, plan, receive):
        if plan.upload and not self.app.upload_slots.acquire(blocking=False):
            return error_response(503, 'Há outros envios em andamento. Tente novamente.')
        try:
            try:
                body = await asyncio.wait_for(self.read_body(plan.length, receive), timeout=120 if plan.upload else 15)
            except asyncio.TimeoutError:
                return error_response(408, 'Tempo de envio esgotado.')
            except ValueError:
                return error_response(400, 'Transferência incompleta ou inválida.')
            if body is None:
                return None
            return await self.run_sync(plan.finish, body)
        finally:
            if plan.upload:
                self.app.upload_slots.release()

    @staticmethod
    async def read_body(length, receive):
        body = bytearray()
        while True:
            event = await receive()
            if event['type'] == 'http.disconnect':
                return None
            chunk = event.get('body', b'')
            if len(body) + len(chunk) > length:
                raise ValueError
            body.extend(chunk)
            if not event.get('more_body'):
                if len(body) != length:
                    raise ValueError
                return body

    @staticmethod
    async def respond(response, method, send):
        try:
            await send({'type': 'http.response.start', 'status': response.status,
                        'headers': [(key.lower().encode('ascii'), value.encode('ascii'))
                                    for key, value in response.headers(public=True).items()]})
            if method != 'HEAD' and response.status != 304 and response.file is not None:
                remaining = response.length
                while remaining:
                    chunk = await asyncio.to_thread(response.file.read, min(remaining, CHUNK_BYTES))
                    if not chunk:
                        break
                    await send({'type': 'http.response.body', 'body': chunk, 'more_body': True})
                    remaining -= len(chunk)
                body = b''
            else:
                body = b'' if method == 'HEAD' or response.status == 304 else response.body
            await send({'type': 'http.response.body', 'body': body})
        finally:
            response.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', default=os.environ.get('MIDISHARE_PUBLIC_ORIGIN'),
                        help='Origem HTTPS, por exemplo https://midi.seudominio.com')
    parser.add_argument('--port', type=int, default=8000, help='Porta interna em 127.0.0.1')
    parser.add_argument('--data', required=True, type=Path, help='Diretório persistente de contas e arquivos')
    parser.add_argument('--max-users', type=int, default=100)
    parser.add_argument('--max-files', type=int, default=2000)
    parser.add_argument('--max-total-mib', type=int, default=512)
    args = parser.parse_args()
    if not (0 < args.port <= 65535 and min(args.max_users, args.max_files, args.max_total_mib) > 0):
        parser.error('Informe uma porta válida e limites positivos.')
    try:
        origin_host(args.origin)
    except ValueError as error:
        parser.error(str(error))
    try:
        import uvicorn
    except ImportError:
        parser.exit(1, 'Instale as dependências: python -m pip install -r requirements-publico.txt\n')
    store = MidiStore(args.data, args.max_files, args.max_total_mib * 1024 * 1024)
    try:
        app = Application(store, public_origin=args.origin, max_users=args.max_users)
    except ValueError as error:
        parser.error(str(error))
    uvicorn.run(PublicServer(app), host='127.0.0.1', port=args.port, workers=1, http='h11',
                ws='none', lifespan='off', proxy_headers=False, access_log=False,
                server_header=False, limit_concurrency=64, backlog=128, timeout_keep_alive=5,
                timeout_graceful_shutdown=15, h11_max_incomplete_event_size=16 * 1024)


if __name__ == '__main__':
    main()
