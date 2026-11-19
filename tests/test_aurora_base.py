"""Verifica preservação dos arquivos e das alterações limitadas na base corrigida."""
import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / 'docs/BASE-AURORA-CORRIGIDA.json').read_text(encoding='utf-8'))


class CorrectedAuroraBaseTests(unittest.TestCase):
    def test_every_corrected_package_file_is_present(self):
        self.assertEqual(len(MANIFEST['arquivos']), 617)
        for item in MANIFEST['arquivos']:
            self.assertTrue((ROOT / item['destino']).is_file(), item['origem'])

    def test_unmodified_files_match_corrected_source(self):
        for item in MANIFEST['arquivos']:
            if not item['adaptado']:
                digest = hashlib.sha256((ROOT / item['destino']).read_bytes()).hexdigest()
                self.assertEqual(digest, item['sha256'], item['origem'])

    def test_index_contains_only_declared_network_adaptations(self):
        index = next(i for i in MANIFEST['arquivos'] if i['origem'] == 'index.html')
        text = (ROOT / index['destino']).read_text(encoding='utf-8')
        self.assertEqual(text.count('window.MidiShareAurora = {'), 1)
        start = text.index('// Adaptador de rede:')
        end = text.index('</script>', start)
        original = text[:start] + text[end:]
        for addition in (
            '\n<script src="/shared/lan-compat.js"></script>',
            '<link rel="stylesheet" href="/shared/network.css">\n',
            '<link rel="stylesheet" href="/shared/studio.css">\n<script src="/shared/studio.js"></script>\n',
            '<script src="/shared/network-api.js"></script>\n<script src="/shared/network.js"></script>\n',
        ):
            self.assertEqual(original.count(addition), 1)
            original = original.replace(addition, '', 1)
        original = original.replace('<!--MIDI_AUTH_CONTEXT--><link rel="stylesheet" href="/shared/auth.css"><script src="/shared/auth-guard.js"></script>', '', 1)
        original = original.replace('indexedDB.open("midishare-" + globalThis.MidiShareSession.user.id + "-aurora-v2", 1)', 'indexedDB.open("aurora-midi-v2", 1)')
        original = original.replace('localStorage.getItem("midishare-" + globalThis.MidiShareSession.user.id + "-aurora-v2")', 'localStorage.getItem("aurora-midi-v2")')
        original = original.replace('localStorage.setItem("midishare-" + globalThis.MidiShareSession.user.id + "-aurora-v2",', 'localStorage.setItem("aurora-midi-v2",')
        original = original.replace('["midishare-" + globalThis.MidiShareSession.user.id + "-aurora-v2"]', '["aurora-midi-v2", "aurora-midi-v1"]')
        original = original.replace('const uid = () => globalThis.MidiShareUUID();',
                                    'const uid = () => globalThis.crypto.randomUUID();', 1)
        self.assertEqual(hashlib.sha256(original.encode('utf-8')).hexdigest(), index['sha256'])
