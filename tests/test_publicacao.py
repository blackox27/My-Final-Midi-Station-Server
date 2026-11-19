"""Verifica compatibilidade de dados e os dois modos de publicação."""
from __future__ import annotations

import hashlib
import http.client
import importlib.util
import json
import socket
import sqlite3
import tempfile
import threading
import time
import unittest
from functools import partial
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from zipfile import ZipFile

from ferramentas.build_pages import build
from servidor.aplicacao import Application, PUBLIC_COOKIE
from servidor.auth import AuthStore, IDLE_SECONDS, ITERATIONS, REMEMBER_IDLE_SECONDS, REMEMBER_SECONDS
from servidor.publico import PublicServer
from servidor.storage import MidiStore

ROOT = Path(__file__).resolve().parents[1]


class CompatibilityTests(unittest.TestCase):
    def test_old_database_upgrades_without_changing_password_or_session(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'contas.sqlite3'
            password = 'uma-senha-de-teste'
            salt = b'1234567890abcdef'
            hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, ITERATIONS)
            old_id, token = 'd' * 32, 't' * 43
            now = time.time()
            with sqlite3.connect(path) as db:
                db.executescript('''
                    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
                        salt BLOB NOT NULL, digest BLOB NOT NULL, iterations INTEGER NOT NULL, created REAL NOT NULL);
                    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
                        csrf TEXT NOT NULL, created REAL NOT NULL, seen REAL NOT NULL, expires REAL NOT NULL);
                ''')
                db.execute('INSERT INTO users VALUES (?,?,?,?,?,?)', (old_id, 'antiga', salt, hashed, ITERATIONS, now))
                db.execute('INSERT INTO sessions VALUES (?,?,?,?,?,?)',
                           (AuthStore.token_hash(token), old_id, 'csrf-v2', now, now, now + 3600))
            auth = AuthStore(directory)
            user = auth.login('antiga', password)
            self.assertEqual(user['id'], old_id)
            self.assertEqual(auth.session(token), {'user': user, 'csrf': 'csrf-v2'})
            remembered, _ = auth.create_session(user, remember=True)
            with auth.db() as db:
                old, new = db.execute('SELECT idle_seconds, expires - created FROM sessions ORDER BY created').fetchall()
                self.assertEqual(old[0], IDLE_SECONDS)
                self.assertEqual(tuple(new), (REMEMBER_IDLE_SECONDS, REMEMBER_SECONDS))
                self.assertEqual(db.execute('SELECT digest FROM users').fetchone()[0], hashed)
                db.execute('UPDATE sessions SET seen=?', (now - IDLE_SECONDS - 1,))
            fresh = AuthStore(directory)
            self.assertIsNone(fresh.session(token))
            self.assertEqual(fresh.session(remembered)['user'], user)
            with fresh.db() as db:
                db.execute('UPDATE sessions SET seen=?', (now - REMEMBER_IDLE_SECONDS - 1,))
            self.assertIsNone(fresh.session(remembered))


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag in ('a', 'link', 'script'):
            self.links.extend(value for key, value in attrs if key in ('href', 'src') and value)


class StaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


class PagesTests(unittest.TestCase):
    def test_build_is_static_and_contains_only_public_files(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'projeto-midi'
            build(output)
            self.assertTrue((output / '.nojekyll').is_file())
            self.assertFalse((output / 'dados').exists())
            self.assertFalse((output / 'login.html').exists())
            self.assertEqual({p.name for p in (output / 'shared').iterdir()}, {'lan-compat.js', 'midi-interop.js'})
            self.assertIn('href="./conta.html"', (output / 'index.html').read_text())
            account = (output / 'conta.html').read_text()
            self.assertIn('Escolha um host para sua biblioteca', account)
            self.assertIn('host-form', account)
            self.assertNotIn('/login.html', account)
            for app in ('aurora', 'auralis', 'midi-tab'):
                page = (output / app / 'index.html').read_text(encoding='utf-8')
                self.assertNotIn('MidiShareSession', page)
                self.assertNotIn('/shared/network', page)
                self.assertIn('../shared/lan-compat.js', page)
            for archive in output.rglob('*.zip'):
                with ZipFile(archive) as zipped:
                    self.assertIsNone(zipped.testzip())
                    self.assertFalse(any(Path(name).suffix in ('.sqlite3', '.pem', '.key') for name in zipped.namelist()))
            build(output, 'https://midi.exemplo.com/')
            account = (output / 'conta.html').read_text()
            self.assertIn('href="https://midi.exemplo.com/login.html?next=%2F"', account)
            self.assertIn('href="https://midi.exemplo.com/login.html?modo=cadastro"', account)
            self.assertIn('não pede nem usa e-mail', account)
            self.assertNotIn('type="password"', account)
            self.assertNotIn('type="email"', account)
            self.assertIn('id="host-form"', account)
            self.assertEqual(account.count('<script'), 1)
            self.assertIn('src="./host-connect.js"', account)
            self.assertNotIn('network-api.js', account)
            self.assertNotIn('/api/', account)
            for url in ('http://midi.exemplo.com', 'https://midi.exemplo.com/api',
                        'https://usuario.github.io', 'https://user:password@midi.exemplo.com'):
                with self.assertRaises(ValueError):
                    build(output, url)
            other = Path(directory) / 'minhas-coisas'
            other.mkdir()
            (other / 'importante.txt').write_text('preservar')
            with self.assertRaises(ValueError):
                build(other)
            self.assertEqual((other / 'importante.txt').read_text(), 'preservar')


    def test_all_app_resources_resolve_under_project_url(self):
        with tempfile.TemporaryDirectory() as directory:
            build(Path(directory) / 'projeto-midi')
            handler = partial(StaticHandler, directory=directory)
            with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
                worker = threading.Thread(target=server.serve_forever, daemon=True)
                worker.start()
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                prefix = '/projeto-midi/'
                try:
                    for page in ('', 'conta.html', 'aurora/', 'auralis/', 'midi-tab/', 'auralis/docs/GUIA.html'):
                        current = prefix + page
                        conn.request('GET', current)
                        response = conn.getresponse()
                        self.assertEqual(response.status, 200, current)
                        parser = LinkParser()
                        parser.feed(response.read().decode('utf-8'))
                        for value in parser.links:
                            if value.startswith(('#', 'data:')):
                                continue
                            link = urlsplit(urljoin(current, value))
                            self.assertFalse(link.netloc or link.scheme, value)
                            self.assertTrue(link.path.startswith(prefix), value)
                            conn.request('HEAD', link.path)
                            response = conn.getresponse()
                            self.assertEqual(response.status, 200, value)
                            response.read()
                    for path in ('api/auth/login', 'api/midis', 'login.html', 'dados/midis/contas.sqlite3'):
                        conn.request('GET', prefix + path)
                        response = conn.getresponse()
                        self.assertEqual(response.status, 404, path)
                        response.read()
                finally:
                    conn.close()
                    server.shutdown()
                    worker.join()


@unittest.skipUnless(importlib.util.find_spec('uvicorn'), 'Instale requirements-publico.txt para testar o servidor ASGI.')
class PublicServerTests(unittest.TestCase):
    origin = 'https://midi.exemplo.com'
    host = 'midi.exemplo.com'

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.start_server()

    def start_server(self):
        import uvicorn
        self.store = MidiStore(self.temp.name)
        app = PublicServer(Application(self.store, public_origin=self.origin))
        self.listener = socket.socket()
        self.listener.bind(('127.0.0.1', 0))
        self.port = self.listener.getsockname()[1]
        self.server = uvicorn.Server(uvicorn.Config(app, lifespan='off', ws='none', http='h11',
                                                  proxy_headers=False, log_level='warning'))
        self.thread = threading.Thread(target=self.server.run, kwargs={'sockets': [self.listener]}, daemon=True)
        self.thread.start()
        for _ in range(200):
            if self.server.started:
                return
            time.sleep(.01)
        self.fail('Servidor ASGI não iniciou.')

    def stop_server(self):
        self.server.should_exit = True
        self.thread.join(5)
        self.listener.close()
        self.assertFalse(self.thread.is_alive())

    def tearDown(self):
        self.stop_server()

    def call(self, method, path, body=None, **headers):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        try:
            conn.request(method, path, body, {'Host': self.host, **headers})
            r = conn.getresponse()
            return r.status, r.headers, r.read()
        finally:
            conn.close()

    def auth(self, action, username, **params):
        return self.call('POST', '/api/auth/' + action, json.dumps(
            {'username': username, 'password': 'uma-senha-de-teste', **params}),
            **{'Origin': self.origin, 'X-MIDI-Share': '1', 'Content-Type': 'application/json'})

    @staticmethod
    def actor(headers, body):
        ctx = json.loads(body)
        return {'Cookie': headers['Set-Cookie'].split(';', 1)[0],
                'X-MIDI-User': ctx['user']['id'], 'X-CSRF-Token': ctx['csrf']}

    def test_public_portal_account_links_and_username_only_flow(self):
        with tempfile.TemporaryDirectory() as directory:
            output = build(Path(directory) / 'pages', self.origin)
            parser = LinkParser()
            parser.feed((output / 'conta.html').read_text(encoding='utf-8'))
            destinations = [urlsplit(url) for url in parser.links if url.startswith('https://')]
            self.assertEqual(len(destinations), 2)
            for target in destinations:
                self.assertEqual((target.netloc, target.path), (self.host, '/login.html'))
                result, headers, page = self.call('GET', target.path + '?' + target.query)
                self.assertEqual(result, 200)
                self.assertIn('no-store', headers['Cache-Control'])
                self.assertIn(b'name="username"', page)
                self.assertIn(b'type="password"', page)
                self.assertNotIn(b'type="email"', page)
        for action in ('register', 'login'):
            self.assertEqual(self.auth(action, 'nome@example.com')[0], 400)
            status, _, detail = self.auth(action, 'musico', email='nome@example.com')
            self.assertEqual(status, 400)
            self.assertIn('não aceita e-mail', json.loads(detail)['error'])
            self.assertNotIn(b'nome@example.com', detail)
        self.assertEqual(self.auth('register', 'musico')[0], 201)
        self.assertEqual(self.auth('login', 'musico')[0], 200)

    def test_login_and_private_library_survive_restart(self):
        self.assertEqual(self.call('GET', '/api/health', Host='outro.exemplo.com')[0], 400)
        self.assertEqual(self.call('POST', '/api/auth/login', '{}', **{
            'Origin': 'https://outro.exemplo.com', 'X-MIDI-Share': '1', 'Content-Type': 'application/json'})[0], 403)
        code, headers, body = self.auth('register', 'titular', remember=True)
        self.assertEqual(code, 201)
        self.assertTrue(headers['Set-Cookie'].startswith(PUBLIC_COOKIE + '='))
        for flag in ('Secure', 'HttpOnly', 'SameSite=Strict', 'Max-Age=2592000'):
            self.assertIn(flag, headers['Set-Cookie'])
        self.assertIn('max-age=', headers['Strict-Transport-Security'])
        first = self.actor(headers, body)
        midi = (ROOT / 'exemplos' / 'Estudo-em-Do.mid').read_bytes()
        status, _, data = self.call('POST', '/api/midis?name=Teste.mid&source=Auralis', midi,
                                   **{**first, 'Origin': self.origin, 'X-MIDI-Share': '1'})
        self.assertEqual(status, 201)
        item = json.loads(data)['item']
        self.stop_server()
        self.start_server()
        self.assertEqual(self.call('GET', '/api/auth/session', **first)[0], 200)

        code, headers, body = self.auth('login', 'titular')
        self.assertEqual(code, 200)
        self.assertNotIn('Max-Age', headers['Set-Cookie'])
        other_device = self.actor(headers, body)
        self.assertNotEqual(first['Cookie'], other_device['Cookie'])
        code, h, data = self.call('GET', '/api/midis/' + item['id'], **other_device)
        self.assertEqual((code, data), (200, midi))
        self.assertEqual(h['Cache-Control'], 'no-store, private')
        self.assertEqual(self.call('HEAD', '/api/midis/' + item['id'], **other_device)[2], b'')

        code, headers, body = self.auth('register', 'visitante')
        self.assertEqual(code, 201)
        visitor = self.actor(headers, body)
        self.assertEqual(json.loads(self.call('GET', '/api/midis', **visitor)[2])['items'], [])
        self.assertEqual(self.call('GET', '/api/midis/' + item['id'], **visitor)[0], 404)
        self.assertEqual(self.call('POST', '/api/auth/logout', **{
            **other_device, 'Origin': self.origin, 'X-MIDI-Share': '1'})[0], 200)
        self.assertEqual(self.call('GET', '/api/auth/session', **other_device)[0], 401)
        self.assertEqual(self.call('GET', '/api/auth/session', **first)[0], 200)
