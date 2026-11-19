"""Testes reais de HTTP usando armazenamento temporário."""
import concurrent.futures
import hashlib
import http.client
import importlib.util
import json
import struct
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("midishare_server", ROOT / "servidor/server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.midi = (ROOT / "exemplos/Estudo-em-Do.mid").read_bytes()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = server.MidiStore(Path(self.temp.name))
        self.http = server.MidiHTTPServer(("127.0.0.1", 0), self.store)
        self.user = self.http.auth.register('testuser', 'test-password-only')
        self.token, self.context = self.http.auth.create_session(self.user)
        self.cookie = 'midishare_session=' + self.token
        self.store = self.http.user_store(self.user['id'])
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.http.server_port, timeout=5)
        defaults = {'Cookie': self.cookie, 'X-MIDI-User': self.user['id'], 'X-CSRF-Token': self.context['csrf']}
        defaults.update(headers or {})
        conn.request(method, path, body=body, headers=defaults)
        response = conn.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return result

    def upload(self, name="Música.mid", data=None, extra=None):
        return self.request("POST", "/api/midis?" + urlencode({"name": name, "source": "Aurora"}),
                            self.midi if data is None else data,
                            {"Content-Type": "audio/midi", "X-MIDI-Share": "1", **(extra or {})})

    def test_health_and_empty_list(self):
        code, _, body = self.request("GET", "/api/health")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["status"], "ok")
        self.assertEqual(json.loads(self.request("GET", "/api/midis")[2])["items"], [])

    def test_round_trip_exact_bytes_and_metadata(self):
        code, _, body = self.upload()
        self.assertEqual(code, 201)
        item = json.loads(body)["item"]
        self.assertEqual(item["notes"], 8)
        self.assertEqual(item["name"], "Música.mid")
        code, headers, data = self.request("GET", "/api/midis/" + item["id"])
        self.assertEqual((code, data), (200, self.midi))
        self.assertEqual(headers["X-MIDI-SHA256"], hashlib.sha256(data).hexdigest())
        self.assertIn("filename*=UTF-8''", headers["Content-Disposition"])
        self.assertEqual(json.loads(self.request("GET", "/api/midis")[2])["items"][0], item)

    def test_duplicate_names_keep_both_files(self):
        a = json.loads(self.upload()[2])["item"]["id"]
        b = json.loads(self.upload()[2])["item"]["id"]
        self.assertNotEqual(a, b)
        self.assertEqual(len(self.store.list()), 2)

    def test_parallel_uploads(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.upload("repetido.mid"), range(12)))
        self.assertTrue(all(r[0] == 201 for r in results))
        self.assertEqual(len({item["id"] for item in self.store.list()}), 12)

    def test_store_survives_new_instance(self):
        self.upload()
        other = server.MidiStore(self.store.directory)
        item = other.list()[0]
        self.assertEqual(other.read(item["id"])[1], self.midi)

    def test_reject_non_midi_and_truncated(self):
        for content in [b"not a midi", self.midi[:-1], b"MThd" + bytes(30)]:
            self.assertEqual(self.upload(data=content)[0], 400)
        self.assertEqual(self.store.list(), [])

    def test_reject_type2_and_smpte(self):
        for offset, value in [(8, 2), (12, 0xE728)]:
            data = bytearray(self.midi)
            struct.pack_into(">H", data, offset, value)
            self.assertEqual(self.upload(data=data)[0], 400)

    def test_valid_running_status(self):
        events = b'\x00\x90\x3c\x64\x01\x3e\x64\x01\x80\x3c\x00\x00\x3e\x00\x00\xff\x2f\x00'
        data = b'MThd' + struct.pack('>IHHH', 6, 0, 1, 480) + b'MTrk' + struct.pack('>I', len(events)) + events
        self.assertEqual(self.upload(data=data)[0], 201)

    def test_reject_extension_and_oversized_request(self):
        self.assertEqual(self.upload(name="song.txt")[0], 400)
        code, _, _ = self.request("POST", "/api/midis?name=x.mid", headers={
            "X-MIDI-Share": "1", "Content-Length": str(server.MAX_BYTES + 1)})
        self.assertEqual(code, 413)

    def test_reject_cross_origin_and_missing_header(self):
        self.assertEqual(self.upload(extra={"Origin": "http://elsewhere.invalid"})[0], 403)
        self.assertEqual(self.request("POST", "/api/midis?name=x.mid", self.midi)[0], 403)
        self.assertEqual(self.upload(extra={"Origin": f"http://127.0.0.1:{self.http.server_port}"})[0], 201)

    def test_static_routes_and_private_paths(self):
        for path in ["/", "/aurora/", "/midi-tab/", "/shared/network.js", "/shared/exemplo.mid"]:
            self.assertEqual(self.request("GET", path)[0], 200, path)
        for path in ["/../servidor/server.py", "/%2e%2e/servidor/server.py", "/dados/midis/", "/api/midis/../../server.py"]:
            self.assertEqual(self.request("GET", path)[0], 404, path)
        status, headers, body = self.request("HEAD", "/shared/network.js")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertGreater(int(headers["Content-Length"]), 0)

    def test_filename_sanitization_and_missing_id(self):
        item = json.loads(self.upload(name="../../Olá\r\n.mid")[2])["item"]
        self.assertEqual(item["name"], "Olá.mid")
        self.assertEqual(self.request("GET", "/api/midis/" + "0" * 32)[0], 404)


if __name__ == "__main__":
    unittest.main()
