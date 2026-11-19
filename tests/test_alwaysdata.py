"""Perfil alwaysdata em IPv6 e proxy simulado: sem acesso a hospedagem externa."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import http.client
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from servidor.alwaysdata import Settings
from servidor.auth import AuthError, AuthStore
from servidor.instancia import DataLease
from servidor.limites import DiskBudget
from servidor.publico import PublicServer
from servidor.storage import MidiStore, StorageFull

ROOT = Path(__file__).resolve().parents[1]
MIDI = (ROOT / 'exemplos' / 'Estudo-em-Do.mid').read_bytes()


def config(directory, **changes):
    return {'IP': '::1', 'PORT': '8100', 'MIDISHARE_PUBLIC_ORIGIN': 'https://musica.alwaysdata.net',
            'MIDISHARE_DATA': str(Path(directory) / 'privado'), **changes}


class HostingConfigurationTests(unittest.TestCase):
    def test_free_profile_rejects_unsafe_or_incomplete_configuration(self):
        with tempfile.TemporaryDirectory() as d:
            env = config(d)
            settings = Settings.from_env(env)
            self.assertEqual(settings.upload_bytes, 8 * 2**20)
            self.assertFalse(settings.data.is_relative_to(ROOT))
            invalid = [
                {'MIDISHARE_PUBLIC_ORIGIN': 'http://musica.alwaysdata.net'},
                {'MIDISHARE_PUBLIC_ORIGIN': 'https://musica.alwaysdata.net/path'},
                {'MIDISHARE_PUBLIC_ORIGIN': 'https://user:secret@musica.alwaysdata.net'},
                {'MIDISHARE_PUBLIC_ORIGIN': 'https://musica.github.io'},
                {'MIDISHARE_DATA': str(ROOT / 'web' / 'dados')},
                {'MIDISHARE_DATA': 'dados'}, {'IP': '127.0.0.1'}, {'IP': ''},
                {'PORT': '0'}, {'PORT': '65536'}, {'MIDISHARE_UPLOAD_MIB': '32'},
                {'MIDISHARE_REGISTRATION_OPEN': 'false'}, {'MIDISHARE_TOTAL_MIB': '-1'},
            ]
            for change in invalid:
                with self.subTest(change=change), self.assertRaises(ValueError):
                    Settings.from_env({**env, **change})

    def test_only_one_process_lease_can_use_a_data_folder(self):
        with tempfile.TemporaryDirectory() as d:
            first = DataLease(d).acquire()
            try:
                with self.assertRaises(OSError):
                    DataLease(d).acquire()
            finally:
                first.close()
            DataLease(d).acquire().close()

    def test_password_reset_revokes_only_the_accounts_sessions(self):
        with tempfile.TemporaryDirectory() as d:
            auth = AuthStore(d, kdf_slots=1)
            alice = auth.register('alice', 'senha-anterior')
            bob = auth.register('bob', 'senha-diferente')
            token, _ = auth.create_session(alice, remember=True)
            other, _ = auth.create_session(bob)
            auth.set_password('alice', 'nova-senha-do-teste')
            self.assertIsNone(auth.session(token))
            self.assertEqual(auth.session(other)['user'], bob)
            self.assertEqual(AuthStore(d).login('alice', 'nova-senha-do-teste'), alice)
            with self.assertRaises(AuthError):
                auth.login('alice', 'senha-anterior')


class DiskBudgetTests(unittest.TestCase):
    def test_total_quota_serializes_different_accounts_and_replay_survives_full_disk(self):
        with tempfile.TemporaryDirectory() as d:
            # Uma gravação cabe, mas a reserva simultânea de duas não cabe.
            budget = DiskBudget(d, len(MIDI) + 4096)
            stores = [MidiStore(Path(d) / name, budget=budget) for name in ('alice', 'bob')]
            def upload(i):
                try:
                    return stores[i].accept('musica.mid', 'Auralis', MIDI, 'pedido-confirmado-123')
                except StorageFull:
                    return None
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(upload, (0, 1)))
            self.assertEqual(sum(result is not None for result in results), 1)
            owner = next(i for i, result in enumerate(results) if result)
            budget.limit_bytes = budget.used_bytes()
            item, replayed = stores[owner].accept('musica.mid', 'Auralis', MIDI, 'pedido-confirmado-123')
            self.assertTrue(replayed)
            self.assertEqual(item['id'], results[owner][0]['id'])
            stores[owner].delete(item['id'])
            self.assertEqual(stores[owner].list(), [])
            self.assertEqual(budget.used_bytes(), 0)

    def test_low_free_space_rejects_new_upload_without_partial_files(self):
        with tempfile.TemporaryDirectory() as d:
            store = MidiStore(d, budget=DiskBudget(d, 1024 * 1024))
            with patch('servidor.limites.shutil.disk_usage', return_value=type('Disk', (), {'free': 1})()):
                with self.assertRaises(StorageFull):
                    store.accept('musica.mid', 'Aurora', MIDI)
            self.assertEqual(list(Path(d).iterdir()), [])

    def test_failed_delete_restores_metadata(self):
        with tempfile.TemporaryDirectory() as d:
            store = MidiStore(d)
            item = store.save('musica.mid', 'Aurora', MIDI)
            original = Path.unlink
            def fail(path, *args, **kwargs):
                if path.suffix == '.mid':
                    raise OSError('falha simulada')
                return original(path, *args, **kwargs)
            with patch.object(Path, 'unlink', fail):
                with self.assertRaises(OSError):
                    store.delete(item['id'])
            self.assertEqual(store.read(item['id'])[1], MIDI)


class CancellationTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancelled_client_waits_for_worker_and_closes_open_response(self):
        from servidor.aplicacao import Response
        started, finish = threading.Event(), threading.Event()
        with tempfile.TemporaryFile() as file:
            response = Response(200, file=file, length=0)
            def worker():
                started.set()
                finish.wait(3)
                return response
            task = asyncio.create_task(PublicServer.run_sync(worker))
            while not started.is_set():
                await asyncio.sleep(.001)
            task.cancel()
            await asyncio.sleep(.01)
            self.assertFalse(task.done())
            finish.set()
            with self.assertRaises(asyncio.CancelledError):
                await task
            self.assertTrue(file.closed)


@unittest.skipUnless(socket.has_ipv6 and importlib.util.find_spec('uvicorn'), 'Requer IPv6 e requirements-publico.txt')
class AlwaysdataHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.process = None
        self.env = {**os.environ, **config(self.temp.name), 'PYTHONUNBUFFERED': '1'}
        self.start()

    def tearDown(self):
        self.stop()
        self.temp.cleanup()

    def start(self, **options):
        self.env.update(options)
        with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as listener:
            listener.bind(('::1', 0))
            self.env['PORT'] = str(listener.getsockname()[1])
        self.port = int(self.env['PORT'])
        self.log = tempfile.TemporaryFile()
        self.process = subprocess.Popen([sys.executable, '-m', 'servidor.alwaysdata'], cwd=ROOT,
                                        env=self.env, stdout=self.log, stderr=self.log)
        for _ in range(200):
            if self.process.poll() is not None:
                self.log.seek(0)
                self.fail(self.log.read().decode(errors='replace'))
            try:
                if self.call('GET', '/api/health')[0] == 200:
                    return
            except OSError:
                pass
            time.sleep(.01)
        self.fail('O servidor IPv6 não iniciou.')

    def stop(self):
        if self.process is not None:
            self.process.terminate()
            self.process.wait(timeout=10)
            self.process = None
            self.log.close()

    def call(self, method, path, body=None, **headers):
        default = {'Host': 'musica.alwaysdata.net', 'X-Forwarded-Proto': 'https', 'X-Real-IP': '203.0.113.10'}
        default.update(headers)
        conn = http.client.HTTPConnection('::1', self.port, timeout=10)
        try:
            conn.request(method, path, body, default)
            r = conn.getresponse()
            return r.status, r.headers, r.read()
        finally:
            conn.close()

    def auth(self, action, name='titular', **data):
        return self.call('POST', '/api/auth/' + action,
                         json.dumps({'username': name, 'password': 'senha-ficticia-teste', **data}),
                         **{'Content-Type': 'application/json', 'X-MIDI-Share': '1',
                            'Origin': 'https://musica.alwaysdata.net'})

    @staticmethod
    def actor(headers, body):
        ctx = json.loads(body)
        return {'Cookie': headers['Set-Cookie'].split(';', 1)[0],
                'X-MIDI-User': ctx['user']['id'], 'X-CSRF-Token': ctx['csrf'],
                'X-MIDI-Share': '1', 'Origin': 'https://musica.alwaysdata.net'}

    def test_accounts_library_delete_restart_and_registration_switch(self):
        health = json.loads(self.call('GET', '/api/health')[2])
        self.assertEqual(health['max_bytes'], 8 * 2**20)
        for fields in ({'X-Forwarded-Proto': 'http'}, {'X-Real-IP': 'bad-ip'}, {'Host': 'outro.alwaysdata.net'}):
            self.assertEqual(self.call('GET', '/login.html', **fields)[0], 400)
        code, h, body = self.auth('register', remember=True)
        self.assertEqual(code, 201)
        self.assertIn('Secure', h['Set-Cookie'])
        alice = self.actor(h, body)
        self.assertEqual(self.auth('register', 'nome@email.com')[0], 400)
        code, _, body = self.call('POST', '/api/midis?name=musica.mid&source=Auralis', MIDI, **alice)
        self.assertEqual(code, 201)
        item = json.loads(body)['item']
        code, _, page = self.call('GET', '/aurora/', **alice)
        self.assertEqual(code, 200)
        self.assertIn(b'globalThis.MidiShareLimits=', page)
        _, h, body = self.auth('register', 'visitante')
        bob = self.actor(h, body)
        target = '/api/midis/' + item['id']
        self.assertEqual(self.call('GET', target, **bob)[0], 404)
        self.assertEqual(self.call('POST', target + '/delete', **bob)[0], 404)
        self.assertEqual(self.call('POST', target + '/delete', **{**alice, 'X-CSRF-Token': 'errado'})[0], 403)
        self.assertEqual(self.call('POST', '/api/midis?name=grande.mid', **{
            **alice, 'Content-Length': str(8 * 2**20 + 1)})[0], 413)

        self.stop()
        self.start(MIDISHARE_REGISTRATION_OPEN='0')
        self.assertEqual(self.auth('register', 'terceiro')[0], 403)
        page = self.call('GET', '/login.html?modo=cadastro')[2]
        self.assertIn(b'"registration_open": false', page)
        code, h, body = self.auth('login')
        self.assertEqual(code, 200)
        alice = self.actor(h, body)
        self.assertEqual(self.call('GET', target, **alice)[2], MIDI)
        self.assertEqual(self.call('POST', target + '/delete', **alice)[0], 200)
        self.assertEqual(self.call('GET', target, **alice)[0], 404)
        self.assertEqual(json.loads(self.call('GET', '/api/midis', **alice)[2])['items'], [])

    def test_forwarded_ip_rate_limit_does_not_block_every_user_behind_proxy(self):
        for _ in range(6):
            self.assertEqual(self.auth('login', 'inexistente')[0], 401)
        self.assertEqual(self.auth('login', 'inexistente')[0], 429)
        code, _, _ = self.call('POST', '/api/auth/register',
            json.dumps({'username': 'outro', 'password': 'senha-ficticia-teste'}),
            **{'X-Real-IP': '203.0.113.11', 'Content-Type': 'application/json', 'X-MIDI-Share': '1',
               'Origin': 'https://musica.alwaysdata.net'})
        self.assertEqual(code, 201)

    def test_check_command_validates_without_starting_another_server(self):
        result = subprocess.run([sys.executable, '-m', 'servidor.alwaysdata', '--check'], cwd=ROOT,
                                env=self.env, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        info = json.loads(result.stdout)
        self.assertEqual(info['status'], 'ok')
        self.assertEqual(info['mib_per_upload'], 8)
