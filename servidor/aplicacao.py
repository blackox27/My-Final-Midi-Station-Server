"""Regras HTTP, autenticação e persistência compartilhadas pelos dois servidores."""
from __future__ import annotations

import hashlib
import hmac
import json
import mimetypes
import os
import posixpath
import re
import sqlite3
import threading
from dataclasses import dataclass, field
from email.message import Message
from http.cookies import CookieError, SimpleCookie
from pathlib import Path
from typing import BinaryIO, Callable
from urllib.parse import parse_qs, quote, unquote, urlsplit

from .auth import AuthError, AuthStore, COOKIE, RateLimiter, REMEMBER_SECONDS
from .studio import StudioStore, StudioError
from .midi import safe_name
from .storage import ID_PATTERN, MAX_BYTES, MidiStore, StorageFull, UploadConflict

ROOT = Path(__file__).resolve().parents[1]
VERSION = '2.4.0'
CHUNK_BYTES = 256 * 1024
JSON_TYPE = 'application/json; charset=utf-8'
MARKER = b'<!--MIDI_AUTH_CONTEXT-->'
APPS = ('aurora', 'auralis', 'midi-tab')
PUBLIC_ASSETS = ('/shared/', '/auralis/assets/', '/midi-tab/assets/')
PUBLIC_COOKIE = '__Host-midishare_session'


@dataclass
class Response:
    status: int
    body: bytes = b''
    content_type: str | None = None
    extra: dict = field(default_factory=dict)
    private: bool = True
    file: BinaryIO | None = None
    length: int | None = None

    def headers(self, public=False):
        result = {
            'Cache-Control': 'no-store, private' if self.private else 'no-cache',
            'Referrer-Policy': 'same-origin',
            'Cross-Origin-Resource-Policy': 'same-origin',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN',
        }
        if self.status != 304:
            result['Content-Length'] = str(self.length if self.length is not None else len(self.body))
        if self.content_type:
            result['Content-Type'] = self.content_type
        if public:
            result['Strict-Transport-Security'] = 'max-age=31536000'
        return {**result, **self.extra}

    def close(self):
        if self.file is not None:
            self.file.close()


def json_response(status, payload, extra=None):
    body = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return Response(status, body, JSON_TYPE, extra or {})


def error_response(status, message, **fields):
    return json_response(status, {'error': message, **fields})


def origin_host(value):
    """Aceita somente uma origem HTTPS pública, sem caminho, usuário ou query."""
    if not isinstance(value, str) or not re.fullmatch(
            r'https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?/?', value, flags=re.ASCII):
        raise ValueError('Informe uma origem no formato https://midi.seudominio.com.')
    url = urlsplit(value)
    host = url.hostname or ''
    if ('.' not in host or len(host) > 253 or (host == 'github.io' or host.endswith('.github.io')) or
            not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label)
                    for label in host.split('.')) or (url.port is not None and url.port < 1)):
        raise ValueError('Informe um domínio HTTPS próprio para o servidor privado.')
    return host + (f':{url.port}' if url.port not in (None, 443) else '')


@dataclass(frozen=True)
class PostPlan:
    length: int
    finish: Callable[[bytes | bytearray], Response]
    upload: bool = False


class Application:
    def __init__(self, store, web_root=None, *, public_origin=None, max_users=100,
                 max_upload_bytes=MAX_BYTES, upload_slots=4, kdf_slots=4, registration_open=True):
        if not 0 < max_upload_bytes <= MAX_BYTES or min(upload_slots, kdf_slots, max_users) < 1:
            raise ValueError('Limites de execução inválidos.')
        self.max_upload_bytes = max_upload_bytes
        self.registration_open = registration_open
        self.store = store  # arquivos legados não aparecem em nenhuma conta
        self.web_root = Path(web_root or ROOT / 'web').resolve()
        if store.directory.is_relative_to(self.web_root) or self.web_root.is_relative_to(store.directory):
            raise ValueError('Use uma pasta de dados separada da pasta web.')
        self.public_host = origin_host(public_origin) if public_origin is not None else None
        self.auth = AuthStore(store.directory, max_users=max_users, kdf_slots=kdf_slots)
        self.studio = StudioStore(self.auth)
        self.auth_limiter = RateLimiter()
        self.upload_slots = threading.BoundedSemaphore(upload_slots)
        self._stores = {}
        self._stores_lock = threading.Lock()
        self._templates = {}
        self._templates_lock = threading.Lock()

    def user_store(self, user_id):
        if not ID_PATTERN.fullmatch(user_id):
            raise ValueError('Identificador de conta inválido.')
        with self._stores_lock:
            store = self._stores.get(user_id)
            if store is None:
                path = self.store.directory / 'usuarios' / user_id / 'midis'
                if path.resolve() != path:
                    raise OSError('Diretório da conta não pode usar links simbólicos.')
                store = self._stores[user_id] = MidiStore(path, self.store.max_files, self.store.max_total_bytes, budget=self.store.budget)
            return store

    def limits(self):
        return {'max_bytes': self.max_upload_bytes, 'max_files': self.store.max_files,
                'max_total_bytes': self.store.max_total_bytes}

    def template(self, target):
        stat = target.stat()
        signature = stat.st_mtime_ns, stat.st_size
        with self._templates_lock:
            entry = self._templates.get(target)
            if entry is None or entry[0] != signature:
                entry = signature, target.read_bytes().split(MARKER, 1)
                self._templates[target] = entry
            return entry[1]


def etag_matches(value, expected):
    # Comparação fraca é suficiente para GET e HEAD.
    return any(token.strip().removeprefix('W/') in (expected.removeprefix('W/'), '*')
               for token in (value or '').split(','))


class Request:
    def __init__(self, app: Application, method: str, target: str, headers: Message, ip: str, *, tls=False):
        self.app = app
        self.method = method
        self.target = target
        self.headers = headers
        self.ip = ip
        self.secure = tls or bool(app.public_host)
        self.cookie_name = PUBLIC_COOKIE if app.public_host else COOKIE

    def dispatch(self):
        try:
            if self.app.public_host and [h.lower() for h in self.headers.get_all('Host', [])] != [self.app.public_host]:
                return error_response(400, 'Endereço do servidor inválido.')
            if self.method not in ('GET', 'HEAD', 'POST'):
                return error_response(405, 'Método não permitido.')
            try:
                url = urlsplit(self.target)
                if url.scheme or url.netloc:
                    raise ValueError
                path = unquote(url.path, errors='strict')
                if '\x00' in path or '\\' in path:
                    return error_response(404, 'Página não encontrada.')
                normalized = posixpath.normpath('/' + path.lstrip('/'))
                if path.endswith('/') and normalized != '/':
                    normalized += '/'
            except (ValueError, UnicodeError):
                return error_response(400, 'Endereço inválido.')
            if self.method == 'POST':
                return self.post(normalized, url.query)
            return self.get(normalized, url.query)
        except sqlite3.Error:
            return error_response(503, 'Não foi possível acessar as contas. Tente novamente.')
        except OSError:
            return error_response(500, 'Não foi possível acessar os arquivos do servidor.')

    def cookie_token(self):
        try:
            cookie = SimpleCookie()
            cookie.load(self.headers.get('Cookie', ''))
            value = cookie.get(self.cookie_name)
            return value.value if value else None
        except CookieError:
            return None

    def session(self, mutation=False):
        context = self.app.auth.session(self.cookie_token())
        if not context:
            return error_response(401, 'Entre na sua conta para continuar.', code='login_required')
        pinned = self.headers.get('X-MIDI-User')
        if pinned and pinned != context['user']['id']:
            return error_response(409, 'A conta mudou. Reabra a página.', code='account_changed')
        if mutation and (pinned != context['user']['id'] or not hmac.compare_digest(
                self.headers.get('X-CSRF-Token', '').encode('utf-8'), context['csrf'].encode('ascii'))):
            return error_response(403, 'Sessão de formulário inválida. Reabra a página.', code='csrf_invalid')
        return context

    def cookie(self, token, *, remember=False, clear=False):
        value = f'{self.cookie_name}={token}; Path=/; HttpOnly; SameSite=Strict'
        if clear:
            value += '; Max-Age=0'
        elif remember:
            value += f'; Max-Age={REMEMBER_SECONDS}'
        return value + ('; Secure' if self.secure else '')

    def check_origin(self):
        origins = self.headers.get_all('Origin', [])
        host = self.app.public_host or self.headers.get('Host', '')
        expected = ('https://' if self.secure else 'http://') + host
        # Browsers send Origin on POST. Local CLI clients may omit it.
        return (origins == [expected] or (not origins and not self.app.public_host)) and (
            self.headers.get('Sec-Fetch-Site') != 'cross-site' and
            self.headers.get_all('X-MIDI-Share', []) == ['1'])

    def length(self):
        fields = self.headers.get_all('Content-Length', [])
        if self.headers.get('Transfer-Encoding') or len(fields) != 1:
            return None
        value = fields[0]
        if not value.isascii() or not value.isdigit():
            return None
        return int(value) if len(value) <= 10 else MAX_BYTES + 1

    def post(self, path, query):
        if not self.check_origin():
            return error_response(403, 'Origem ou cabeçalho de integração inválido.')
        if path in ('/api/auth/login', '/api/auth/register'):
            length = self.length()
            if length is None or not 0 < length <= 4096:
                return error_response(400, 'Pedido de autenticação inválido.')
            if self.headers.get_content_type() != 'application/json':
                return error_response(415, 'Use application/json.')
            return PostPlan(length, lambda body: self.authenticate(body, path.endswith('/register')))
        if path in ('/api/studio/heartbeat', '/api/studio/send', '/api/studio/ack'):
            context = self.session(mutation=True)
            if isinstance(context, Response):
                return context
            length = self.length()
            if length is None or not 0 < length <= 2048:
                return error_response(400, 'Pedido de conexão inválido.')
            if self.headers.get_content_type() != 'application/json':
                return error_response(415, 'Use application/json.')
            return PostPlan(length, lambda body: self.studio_post(path, body))
        deletion = re.fullmatch(r'/api/midis/([0-9a-f]{32})/delete', path)
        if path not in ('/api/auth/logout', '/api/midis') and deletion is None:
            return error_response(404, 'Rota não encontrada.')
        context = self.session(mutation=True)
        if isinstance(context, Response):
            return context
        if deletion:
            return self.delete(context['user']['id'], deletion[1])
        if path == '/api/auth/logout':
            self.app.auth.logout(self.cookie_token())
            return json_response(200, {'ok': True}, {'Set-Cookie': self.cookie('', clear=True)})
        if self.headers.get('Transfer-Encoding'):
            return error_response(400, 'Envio deve informar Content-Length.')
        length = self.length()
        if length is None:
            return error_response(411, 'Content-Length único e válido obrigatório.')
        if not 0 < length <= self.app.max_upload_bytes:
            return error_response(413, f'O arquivo deve ter entre 1 byte e {self.app.max_upload_bytes // (1024 * 1024)} MiB.')
        try:
            params = parse_qs(query, max_num_fields=8)
            name = safe_name(params.get('name', [''])[0])
        except ValueError as error:
            return error_response(400, str(error))
        source = params.get('source', ['Cliente'])[0]
        user_id = context['user']['id']
        upload_id = self.headers.get('X-MIDI-Upload-ID')
        return PostPlan(length, lambda body: self.upload(user_id, name, source, upload_id, body), upload=True)

    def studio_post(self, path, body):
        # A sessão pode ter sido revogada enquanto o corpo era recebido.
        try:
            context = self.session(mutation=True)
        except sqlite3.Error:
            return error_response(503, 'Não foi possível verificar a sessão. Tente novamente.')
        if isinstance(context, Response):
            return context
        try:
            data = json.loads(body)
            if not isinstance(data, dict):
                raise StudioError('Pedido de conexão inválido.')
            owner = context['user']['id']
            if path.endswith('/send'):
                item_id = data.get('midi_id')
                if not isinstance(item_id, str) or not ID_PATTERN.fullmatch(item_id):
                    raise StudioError('Identificador de MIDI inválido.')
                if self.app.user_store(owner).get(item_id) is None:
                    return error_response(404, 'Arquivo MIDI não encontrado.')
            action = path.rsplit('/', 1)[1]
            result = getattr(self.app.studio, action)(owner, self.app.auth.token_hash(self.cookie_token()), data)
            return json_response(200, result)
        except FileNotFoundError:
            return error_response(404, 'Arquivo MIDI não encontrado.')
        except sqlite3.Error:
            return error_response(503, 'Não foi possível acessar o estúdio. Tente novamente.')
        except OSError:
            return error_response(500, 'Não foi possível acessar os arquivos do servidor.')
        except StudioError as error:
            return error_response(error.status, str(error))
        except (ValueError, TypeError, RecursionError):
            return error_response(400, 'Pedido de conexão inválido.')

    def authenticate(self, body, register):
        if register and not self.app.registration_open:
            return error_response(403, 'Novos cadastros estão fechados. Entre com uma conta existente.')
        try:
            data = json.loads(body)
            if not isinstance(data, dict) or type(data.get('remember', False)) is not bool:
                raise ValueError
            if set(data) - {'username', 'password', 'remember'}:
                return error_response(400, 'Use apenas nome de usuário e senha. O serviço não aceita e-mail.')
            username = self.app.auth.username(data.get('username'))
            self.app.auth_limiter.check(self.ip, username)
            action = self.app.auth.register if register else self.app.auth.login
            user = action(username, data.get('password'))
            remember = data.get('remember', False)
            token, context = self.app.auth.create_session(user, self.cookie_token(), remember=remember)
        except AuthError as error:
            return error_response(error.status, str(error))
        except (ValueError, TypeError, UnicodeError, RecursionError):
            return error_response(400, 'Pedido de autenticação inválido.')
        except sqlite3.Error:
            return error_response(503, 'Não foi possível acessar as contas. Tente novamente.')
        return json_response(201 if register else 200, context, {'Set-Cookie': self.cookie(token, remember=remember)})

    def upload(self, user_id, name, source, upload_id, body):
        # Receber o corpo pode levar minutos. Logout, expiração ou redefinição
        # de senha durante esse intervalo devem impedir uma gravação posterior.
        try:
            context = self.session(mutation=True)
        except sqlite3.Error:
            return error_response(503, 'Não foi possível verificar a sessão. Tente novamente.')
        if isinstance(context, Response):
            return context
        if context['user']['id'] != user_id:
            return error_response(409, 'A conta mudou. Reabra a página.', code='account_changed')
        try:
            item, replayed = self.app.user_store(user_id).accept(name, source, body, upload_id)
        except UploadConflict as error:
            return error_response(409, str(error))
        except StorageFull as error:
            return error_response(507, str(error))
        except ValueError as error:
            return error_response(400, str(error))
        except OSError:
            return error_response(500, 'Não foi possível gravar o arquivo no servidor.')
        return json_response(200 if replayed else 201, {'item': item, 'replayed': replayed})

    def delete(self, user_id, item_id):
        try:
            self.app.user_store(user_id).delete(item_id)
        except FileNotFoundError:
            return error_response(404, 'Arquivo MIDI não encontrado.')
        except OSError:
            return error_response(500, 'Não foi possível excluir o arquivo. Tente novamente.')
        return json_response(200, {'ok': True})

    def get(self, path, query):
        if path == '/api/health':
            return json_response(200, {'status': 'ok', 'service': 'MIDI Share', 'version': VERSION, 'studio': True,
                **self.app.limits(), 'registration_open': self.app.registration_open})
        if path == '/api/studio':
            context = self.session()
            if isinstance(context, Response):
                return context
            try:
                params = parse_qs(query, max_num_fields=1)
                if set(params) != {'client_id'} or len(params['client_id']) != 1:
                    raise StudioError('Informe a conexão deste aplicativo.')
                return json_response(200, self.app.studio.poll(context['user']['id'],
                    self.app.auth.token_hash(self.cookie_token()), params['client_id'][0]))
            except StudioError as error:
                return error_response(error.status, str(error))
            except ValueError:
                return error_response(400, 'Consulta inválida.')
        if path == '/api/auth/session' or path == '/api/midis' or path.startswith('/api/midis/'):
            context = self.session()
            if isinstance(context, Response):
                return context
            if path == '/api/auth/session':
                return json_response(200, context)
            return self.midi_get(path, context['user']['id'])
        if path.startswith('/api/'):
            return error_response(404, 'Rota não encontrada.')
        return self.page(path, query)

    def midi_get(self, path, user_id):
        store = self.app.user_store(user_id)
        if path == '/api/midis':
            data, fingerprint = store.listing()
            etag = '"' + hashlib.sha256((user_id + fingerprint).encode()).hexdigest() + '"'
            if etag_matches(self.headers.get('If-None-Match'), etag):
                return Response(304, extra={'ETag': etag})
            return Response(200, data, JSON_TYPE, {'ETag': etag})
        item_id = path.removeprefix('/api/midis/')
        metadata_only = item_id.endswith('/meta')
        if metadata_only:
            item_id = item_id[:-5]
        try:
            item = store.get(item_id)
            if metadata_only:
                return json_response(200, {'item': item})
            return self.file_response(store.path(item_id), 'audio/midi', etag='"' + item['sha256'] + '"',
                extra={'Content-Disposition': "attachment; filename=musica.mid; filename*=UTF-8''" +
                        quote(item['name'], safe=''), 'X-MIDI-SHA256': item['sha256']})
        except (OSError, ValueError):
            return error_response(404, 'Arquivo MIDI não encontrado.')

    def page(self, path, query):
        parts = path.split('/')
        section = parts[1]
        public_asset = path.startswith(PUBLIC_ASSETS) and not path.lower().endswith(('.html', '.htm'))
        context = None
        if not public_asset and (path in ('/', '/index.html') or section in APPS):
            context = self.app.auth.session(self.cookie_token())
            if not context:
                return Response(303, extra={'Location': '/login.html?next=' + quote(self.target, safe='')})
        if section in APPS and len(parts) == 2:
            # Preserve links to a song when adding the canonical trailing slash.
            suffix = '?' + quote(query, safe="!$&'()*+,-./:;=?@_%~") if query else ''
            return Response(308, extra={'Location': '/' + section + '/' + suffix})
        if path.endswith('/'):
            path += 'index.html'
        try:
            target = (self.app.web_root / path.lstrip('/')).resolve()
        except (ValueError, OSError):
            return error_response(404, 'Página não encontrada.')
        # Exige o mesmo caminho canônico; symlinks não abrem atalhos para páginas protegidas.
        if (target != self.app.web_root / path.lstrip('/') or not target.is_file() or
                not target.is_relative_to(self.app.web_root)):
            return error_response(404, 'Página não encontrada.')
        content_type = 'text/javascript' if target.suffix == '.js' else (
            mimetypes.guess_type(str(target))[0] or 'application/octet-stream')
        if content_type.startswith('text/'):
            content_type += '; charset=utf-8'
        if path == '/login.html':
            config = json.dumps({'registration_open': self.app.registration_open}, ensure_ascii=True)
            body = target.read_bytes().replace(b'<!--MIDI_LOGIN_OPTIONS-->',
                ('<script>globalThis.MidiShareConfig=' + config + ';</script>').encode())
            return Response(200, body, content_type)
        if target.suffix == '.html' and context:
            chunks = self.app.template(target)
            if len(chunks) == 2:
                session = json.dumps(context, ensure_ascii=True, separators=(',', ':')).replace('<', '\\u003c')
                limits = json.dumps(self.app.limits(), separators=(',', ':'))
                script = ('<script>globalThis.MidiShareSession=' + session +
                          ';globalThis.MidiShareLimits=' + limits + ';</script>').encode()
                return Response(200, chunks[0] + script + chunks[1], content_type)
        return self.file_response(target, content_type, private=not public_asset)

    def file_response(self, path, content_type, *, private=True, extra=None, etag=None):
        try:
            handle = path.open('rb')
        except (FileNotFoundError, PermissionError, IsADirectoryError):
            return error_response(404, 'Arquivo não encontrado.')
        try:
            stat = os.fstat(handle.fileno())
            etag = etag or f'W/"{stat.st_mtime_ns:x}-{stat.st_size:x}"'
            if etag_matches(self.headers.get('If-None-Match'), etag):
                handle.close()
                return Response(304, extra={'ETag': etag}, private=private)
            return Response(200, content_type=content_type, extra={'ETag': etag, **(extra or {})},
                            private=private, file=handle, length=stat.st_size)
        except BaseException:
            handle.close()
            raise
