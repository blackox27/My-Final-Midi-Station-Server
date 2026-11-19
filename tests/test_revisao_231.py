"""Regressões de integridade e sessão durante uma transferência longa."""
from email.message import Message
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from servidor.aplicacao import Application, PostPlan, Request, Response
from servidor.storage import MidiStore

MIDI=(Path(__file__).resolve().parents[1]/'exemplos/Estudo-em-Do.mid').read_bytes()


class RevisionTests(unittest.TestCase):
    def test_same_size_corruption_is_not_listed_or_served(self):
        with tempfile.TemporaryDirectory() as d:
            store=MidiStore(d)
            item=store.save('original.mid','Auralis',MIDI)
            self.assertEqual(store.read(item['id'])[1],MIDI)
            modified=bytearray(MIDI);modified[-1]^=1
            (Path(d)/(item['id']+'.mid')).write_bytes(modified)
            with self.assertRaises(FileNotFoundError):
                store.get(item['id'])
            self.assertEqual(store.list(),[])
            self.assertEqual(store.ignored,1)

    def test_unchanged_download_does_not_rehash_midi(self):
        with tempfile.TemporaryDirectory() as d:
            store=MidiStore(d)
            item=store.save('original.mid','Auralis',MIDI)
            store=MidiStore(d) # verifica integridade ao carregar
            with patch.object(Path,'open',side_effect=AssertionError('unnecessary content read')):
                self.assertEqual(store.get(item['id'])['sha256'],item['sha256'])

    def test_logout_and_password_reset_during_upload_prevent_commit(self):
        with tempfile.TemporaryDirectory() as d:
            app=Application(MidiStore(d))
            user=app.auth.register('musico','senha-ficticia-teste')
            for action in ('logout','password','expire'):
                token,ctx=app.auth.create_session(user)
                headers=Message()
                for key,value in {'Host':'localhost','X-MIDI-Share':'1','Cookie':'midishare_session='+token,
                    'X-MIDI-User':user['id'],'X-CSRF-Token':ctx['csrf'],'Content-Length':str(len(MIDI))}.items():
                    headers[key]=value
                plan=Request(app,'POST','/api/midis?name=musica.mid',headers,'127.0.0.1').dispatch()
                self.assertIsInstance(plan,PostPlan)
                if action=='logout':app.auth.logout(token)
                elif action=='password':app.auth.set_password('musico','outra-senha-ficticia')
                else:
                    with app.auth.db() as db:db.execute('UPDATE sessions SET expires=0')
                result=plan.finish(MIDI)
                self.assertIsInstance(result,Response)
                self.assertEqual(result.status,401,action)
                self.assertEqual(app.user_store(user['id']).list(),[])
