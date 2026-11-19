"""Regressões da revisão 1.1, incluindo falhas reproduzidas na versão 1.0."""
import concurrent.futures
import json
import socket
import struct
import threading
from pathlib import Path
from unittest.mock import patch
import test_server as base
server = base.server

# Importar a classe como base reutiliza o servidor HTTP temporário dos testes.
class ImprovementsTests(base.ServerTests):
    def test_incomplete_metadata_does_not_break_list(self):
        self.upload()
        invalid = 'a' * 32
        (self.store.directory / f'{invalid}.mid').write_bytes(self.midi)
        (self.store.directory / f'{invalid}.json').write_text(json.dumps({'id': invalid}))
        code, _, body = self.request('GET', '/api/midis')
        self.assertEqual(code, 200)
        doc = json.loads(body)
        self.assertEqual(len(doc['items']), 1)
        self.assertEqual(doc['ignored'], 1)

    def test_corrupt_and_wrong_types_are_ignored(self):
        item = json.loads(self.upload()[2])['item']
        target = self.store.directory / (item['id'] + '.json')
        for key, bad in [('created_at', 'not-a-date'), ('size', True), ('sha256', 'oops'), ('name', '../test.mid'), ('source', '\ud800'), ('upload_id', 1234567890123456)]:
            changed = dict(item); changed[key] = bad
            target.write_text(json.dumps(changed))
            self.assertEqual(self.store.list(), [])
        target.write_text('{invalid json')
        self.assertEqual(self.store.list(), [])

    def test_size_change_is_not_served_as_valid_entry(self):
        item = json.loads(self.upload()[2])['item']
        (self.store.directory / (item['id'] + '.mid')).write_bytes(b'broken')
        self.assertEqual(self.request('GET', '/api/midis/' + item['id'])[0], 404)

    def test_etag_304_and_invalidation_after_upload(self):
        code, headers, _ = self.request('GET', '/api/midis')
        etag = headers['ETag']
        code, _, body = self.request('GET', '/api/midis', headers={'If-None-Match': etag})
        self.assertEqual((code, body), (304, b''))
        self.upload()
        code, new, body = self.request('GET', '/api/midis', headers={'If-None-Match': etag})
        self.assertEqual(code, 200)
        self.assertNotEqual(new['ETag'], etag)
        self.assertEqual(len(json.loads(body)['items']), 1)

    def test_static_and_midi_conditionals_and_head(self):
        for target in ['/shared/network.js', '/api/midis/' + json.loads(self.upload()[2])['item']['id']]:
            _, headers, _ = self.request('GET', target)
            self.assertEqual(self.request('GET', target, headers={'If-None-Match': headers['ETag']})[0], 304)
            self.assertEqual(self.request('HEAD', target, headers={'If-None-Match': '*'})[0], 304)
            status, head, data = self.request('HEAD', target)
            self.assertEqual((status, data), (200, b''))
            self.assertEqual(headers['Content-Length'], head['Content-Length'])

    def test_streaming_does_not_use_whole_file_read(self):
        item = json.loads(self.upload()[2])['item']
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('whole file allocation')):
            self.assertEqual(self.request('GET', '/shared/network.js')[0], 200)
            self.assertEqual(self.request('GET', '/api/midis/' + item['id'])[2], self.midi)
            self.assertEqual(self.request('HEAD', '/shared/network.js')[2], b'')

    def test_upload_replay_survives_restart(self):
        headers = {'X-MIDI-Upload-ID': 'repeatable-request-123'}
        a = self.upload(extra=headers)
        b = self.upload(extra=headers)
        self.assertEqual((a[0], b[0]), (201, 200))
        self.assertEqual(json.loads(a[2])['item']['id'], json.loads(b[2])['item']['id'])
        self.http._stores[self.user['id']] = server.MidiStore(self.store.directory)
        c = self.upload(extra=headers)
        self.assertEqual(c[0], 200)
        self.assertEqual(len(self.http.user_store(self.user['id']).list()), 1)
        self.assertNotIn('upload_id', json.loads(c[2])['item'])

    def test_concurrent_retries_commit_once(self):
        headers = {'X-MIDI-Upload-ID': 'parallel-request-123'}
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.upload(extra=headers), range(12)))
        self.assertEqual(sum(r[0] == 201 for r in results), 1)
        self.assertEqual(sum(r[0] == 200 for r in results), 11)
        self.assertEqual(len(self.store.list()), 1)

    def test_replay_with_different_payload_is_conflict(self):
        headers = {'X-MIDI-Upload-ID': 'conflicting-request-123'}
        self.upload(extra=headers)
        self.assertEqual(self.upload(name='another.mid', extra=headers)[0], 409)
        self.assertEqual(len(self.store.list()), 1)

    def test_invalid_upload_id_rejected(self):
        self.assertEqual(self.upload(extra={'X-MIDI-Upload-ID': 'short'})[0], 400)
        self.assertEqual(len(self.store.list()), 0)

    def test_file_and_byte_quotas_and_replay_at_limit(self):
        self.store.max_files = 1
        key = {'X-MIDI-Upload-ID': 'quota-request-1234'}
        self.assertEqual(self.upload(extra=key)[0], 201)
        self.assertEqual(self.upload(extra=key)[0], 200)
        self.assertEqual(self.upload()[0], 507)
        self.store.max_files = 100
        self.store.max_total_bytes = len(self.midi)
        self.assertEqual(self.upload()[0], 507)

    def test_single_download_does_not_scan_the_library_and_detects_deleted_metadata(self):
        item = json.loads(self.upload()[2])['item']
        path = '/api/midis/' + item['id']
        with patch.object(self.store, '_snapshot', side_effect=AssertionError('full catalog scan')):
            self.assertEqual(self.request('GET', path)[2], self.midi)
            (self.store.directory / (item['id'] + '.json')).unlink()
            self.assertEqual(self.request('GET', path)[0], 404)

    def test_trailing_slash_redirect_preserves_song_and_encoded_query(self):
        query = 'midi=' + '1' * 32 + '&nome=M%C3%BAsica'
        code, headers, _ = self.request('GET', '/aurora?' + query)
        self.assertEqual(code, 308)
        self.assertEqual(headers['Location'], '/aurora/?' + query)

    def test_metadata_endpoint(self):
        item = json.loads(self.upload()[2])['item']
        status, _, body = self.request('GET', '/api/midis/' + item['id'] + '/meta')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['item'], item)
        self.assertEqual(self.request('GET', '/api/midis/' + '0' * 32 + '/meta')[0], 404)

    def test_malformed_tempo_and_time_signature_rejected(self):
        tempo = self.midi.replace(b'\xff\x51\x03\x07\xa1\x20', b'\xff\x51\x03\x00\x00\x00')
        signature = self.midi.replace(b'\xff\x58\x04\x04\x02', b'\xff\x58\x04\x00\x02')
        self.assertEqual(self.upload(data=tempo)[0], 400)
        self.assertEqual(self.upload(data=signature)[0], 400)

    def test_external_new_file_is_detected_without_restart(self):
        other = server.MidiStore(self.store.directory)
        other.save('external.mid', 'Portal', self.midi)
        self.assertEqual(len(self.store.list()), 1)

    def test_unchanged_catalog_does_not_reparse_json(self):
        self.upload()
        self.store.list()
        with patch.object(Path, 'read_text', side_effect=AssertionError('metadata reparsed')):
            self.assertEqual(len(self.store.list()), 1)

    def test_too_many_query_fields_rejected(self):
        params = '&'.join('x'+str(i)+'=1' for i in range(20))
        self.assertEqual(self.request('POST', '/api/midis?name=x.mid&'+params, self.midi, {'X-MIDI-Share':'1'})[0], 400)

    def test_nul_path_returns_error_not_disconnect(self):
        self.assertEqual(self.request('GET', '/%00')[0], 404)

    def test_running_status_after_meta_event(self):
        events = b'\x00\x90\x3c\x64\x00\xff\x01\x01X\x01\x3e\x64\x01\x80\x3c\x00\x00\x3e\x00\x00\xff\x2f\x00'
        data = b'MThd' + struct.pack('>IHHH', 6, 0, 1, 480) + b'MTrk' + struct.pack('>I', len(events)) + events
        self.assertEqual(self.upload(data=data)[0], 201)

    def test_connection_limit_returns_503(self):
        import time
        limited = server.MidiHTTPServer(('127.0.0.1', 0), self.store, max_connections=1)
        thread = threading.Thread(target=limited.serve_forever, daemon=True)
        thread.start()
        held = socket.create_connection(limited.server_address)
        try:
            for _ in range(100):
                if limited._slots._value == 0:
                    break
                time.sleep(0.01)
            client = socket.create_connection(limited.server_address)
            try:
                client.sendall(b'GET /api/health HTTP/1.0\r\n\r\n')
                self.assertIn(b'503 Service Unavailable', client.recv(1024))
            finally:
                client.close()
        finally:
            held.close()
            limited.shutdown()
            limited.server_close()
            thread.join()

for _name in vars(base.ServerTests):
    if _name.startswith("test_"):
        setattr(ImprovementsTests, _name, None)
