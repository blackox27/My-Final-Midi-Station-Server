import hashlib
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]

class AuralisBaseTests(unittest.TestCase):
    def test_complete_source_package_and_expected_adaptations(self):
        doc=json.loads((ROOT/'docs/BASE-AURALIS.json').read_text())
        altered=[]
        for item in doc['files']:
            path=ROOT/item['path']
            self.assertTrue(path.is_file(),item['original'])
            if item['modified']:
                altered.append(item['original'])
            else:
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),item['sha256'])
        self.assertEqual(set(altered),{'index.html','assets/app.js','source/src/app.js','source/web/index.html'})

    def test_runtime_and_source_pages_include_auth_and_network(self):
        for rel in ['web/auralis/index.html','web/auralis/source/web/index.html']:
            text=(ROOT/rel).read_text()
            for token in ['<!--MIDI_AUTH_CONTEXT-->','/shared/auth-guard.js','/shared/network-api.js','/shared/network.js']:
                self.assertEqual(text.count(token),1)

    def test_integrated_auralis_checksums(self):
        base=ROOT/'web/auralis'
        for line in (base/'SHA256SUMS.txt').read_text().splitlines():
            digest,name=line.split('  ',1)
            self.assertEqual(hashlib.sha256((base/name).read_bytes()).hexdigest(),digest,name)
