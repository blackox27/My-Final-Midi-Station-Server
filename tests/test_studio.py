"""Integração da API de entrega: isolamento, confirmação, retomada e limites."""
import hashlib
import json
from email.message import Message
from pathlib import Path
import tempfile
import time
import unittest
import uuid

from servidor.aplicacao import Application, PostPlan, Request
from servidor.storage import MidiStore

ROOT = Path(__file__).resolve().parents[1]

def uid():
    return uuid.uuid4().hex


class StudioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = Application(MidiStore(self.temp.name))
        self.alice = self.app.auth.register('alice', 'alice-test-password')
        self.bob = self.app.auth.register('bob', 'bob-test-password')
        self.a, self.ca = self.app.auth.create_session(self.alice)
        self.b, self.cb = self.app.auth.create_session(self.alice)
        self.c, self.cc = self.app.auth.create_session(self.bob)
        self.clients = [uid() for _ in range(3)]
        self.bytes = (ROOT/'exemplos/Estudo-em-Do.mid').read_bytes()
        self.item = self.app.user_store(self.alice['id']).save('Exemplo.mid', 'Aurora', self.bytes)

    def tearDown(self):
        self.temp.cleanup()

    def req(self, method, path, data=None, *, token=None, context=None, headers=None):
        token = self.a if token is None else token
        context = self.ca if context is None else context
        body = json.dumps(data).encode() if data is not None else b''
        h = Message()
        for key,value in {'Host':'localhost:8000','Cookie':'midishare_session='+token,
                'X-MIDI-Share':'1','X-MIDI-User':context['user']['id'],
                'X-CSRF-Token':context['csrf'],'Content-Type':'application/json',
                'Content-Length':str(len(body)), **(headers or {})}.items():
            h[key] = value
        request = Request(self.app, method, path, h, '127.0.0.1')
        result = request.dispatch()
        if isinstance(result, PostPlan):
            result = result.finish(body)
        try:
            payload = result.file.read() if result.file else json.loads(result.body) if result.body else {}
        finally:
            result.close()
        return result.status, payload

    def beat(self, i=0, app='aurora', token=None, context=None):
        return self.req('POST','/api/studio/heartbeat',{'client_id':self.clients[i],'app':app,'label':app+' teste'},token=token,context=context)

    def send(self, request_id=None, **changes):
        data = {'client_id':self.clients[0],'target':self.clients[1],
                'midi_id':self.item['id'],'request_id':request_id or uid(), **changes}
        return self.req('POST','/api/studio/send',data)

    def setup_pair(self):
        self.assertEqual(self.beat()[0],200)
        self.assertEqual(self.beat(1,'midi-tab',self.b,self.cb)[0],200)

    def test_three_apps_exchange_same_midi_bytes_via_authenticated_library(self):
        self.setup_pair()
        self.assertEqual(self.beat(2,'auralis')[0],200)
        for target in self.clients[1:]:
            code,sent = self.send(target=target)
            self.assertEqual(code,200)
            token,context = (self.b,self.cb) if target==self.clients[1] else (self.a,self.ca)
            code,polled = self.req('GET','/api/studio?client_id='+target,token=token,context=context)
            self.assertEqual(code,200);self.assertEqual(len(polled['incoming']),1)
            offer = polled['incoming'][0]
            self.assertEqual(offer['id'],sent['delivery_id'])
            code,raw = self.req('GET','/api/midis/'+offer['midi_id'],token=token,context=context)
            self.assertEqual(code,200);self.assertEqual(hashlib.sha256(raw).hexdigest(),self.item['sha256'])
            self.assertEqual(self.req('POST','/api/studio/ack',{'client_id':target,
                'delivery_id':offer['id'],'state':'accepted'},token=token,context=context)[0],200)
            self.assertEqual(self.req('GET','/api/studio?client_id='+target,token=token,context=context)[1]['incoming'],[])

    def test_other_account_cannot_discover_clients_deliver_or_read_midi(self):
        self.setup_pair()
        other = uid()
        self.assertEqual(self.req('POST','/api/studio/heartbeat',{'client_id':other,'app':'auralis','label':'Bob'},token=self.c,context=self.cc)[0],200)
        self.assertEqual(self.req('GET','/api/studio?client_id='+other,token=self.c,context=self.cc)[1]['clients'][0]['id'],other)
        self.assertEqual(self.send(target=other)[0],404)
        self.assertEqual(self.req('POST','/api/studio/send',{'client_id':other,'target':self.clients[0],
            'midi_id':self.item['id'],'request_id':uid()},token=self.c,context=self.cc)[0],404)
        self.assertEqual(self.req('GET','/api/midis/'+self.item['id'],token=self.c,context=self.cc)[0],404)

    def test_client_bound_to_its_login_session(self):
        self.setup_pair()
        self.assertEqual(self.req('GET','/api/studio?client_id='+self.clients[1])[0],404)
        self.assertEqual(self.beat(1,'midi-tab')[0],409)
        sent = self.send()[1]
        self.assertEqual(self.req('POST','/api/studio/ack',{'client_id':self.clients[1],
            'delivery_id':sent['delivery_id'],'state':'accepted'})[0],404)

    def test_logout_removes_target_from_discovery_and_blocks_delivery(self):
        self.setup_pair()
        self.app.auth.logout(self.b)
        status,data = self.req('GET','/api/studio?client_id='+self.clients[0])
        self.assertEqual(status,200);self.assertEqual(len(data['clients']),1)
        self.assertEqual(self.send()[0],404)
        self.assertEqual(self.req('GET','/api/studio?client_id='+self.clients[1],token=self.b,context=self.cb)[0],401)

    def test_idempotent_delivery_and_conflicting_reuse(self):
        self.setup_pair();rid = uid()
        first = self.send(rid)[1];again = self.send(rid)[1]
        self.assertEqual(first['delivery_id'],again['delivery_id']);self.assertTrue(again['replayed'])
        self.assertEqual(self.send(rid,target=self.clients[0])[0],409)
        ack = {'client_id':self.clients[1],'delivery_id':first['delivery_id'],'state':'accepted'}
        self.assertEqual(self.req('POST','/api/studio/ack',ack,token=self.b,context=self.cb)[0],200)
        self.assertEqual(self.req('POST','/api/studio/ack',ack,token=self.b,context=self.cb)[0],200)
        self.assertEqual(self.req('POST','/api/studio/ack',{**ack,'state':'dismissed'},token=self.b,context=self.cb)[0],409)

    def test_post_rechecks_expired_session_after_receiving_body(self):
        h = Message();body = json.dumps({'client_id':uid(),'app':'aurora','label':'Teste'}).encode()
        for k,v in {'Host':'localhost:8000','Cookie':'midishare_session='+self.a,'X-MIDI-Share':'1',
                    'X-MIDI-User':self.alice['id'],'X-CSRF-Token':self.ca['csrf'],
                    'Content-Type':'application/json','Content-Length':str(len(body))}.items():h[k]=v
        plan = Request(self.app,'POST','/api/studio/heartbeat',h,'127.0.0.1').dispatch()
        self.assertIsInstance(plan,PostPlan);self.app.auth.logout(self.a)
        self.assertEqual(plan.finish(body).status,401)

    def test_csrf_origin_missing_session_and_malformed_payloads_rejected(self):
        data = {'client_id':uid(),'app':'aurora','label':'Teste'}
        self.assertEqual(self.req('POST','/api/studio/heartbeat',data,headers={'X-CSRF-Token':'wrong'})[0],403)
        self.assertEqual(self.req('POST','/api/studio/heartbeat',data,headers={'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.req('GET','/api/studio?client_id='+uid(),token='no-session')[0],401)
        for bad in [[],{},None,{'client_id':'../evil','app':'aurora','label':'X'}, {**data,'email':'bad'}, {**data,'label':'x'*65}]:
            self.assertEqual(self.req('POST','/api/studio/heartbeat',bad)[0],400)
        self.assertEqual(self.req('GET','/api/studio?client_id=x&client_id=y')[0],400)

    def test_presence_expiry_and_pending_delivery_survive_restart(self):
        self.setup_pair();sent = self.send()[1]
        self.app = Application(MidiStore(self.temp.name))
        self.assertEqual(self.app.auth.login('alice','alice-test-password')['id'],self.alice['id'])
        polled = self.req('GET','/api/studio?client_id='+self.clients[1],token=self.b,context=self.cb)[1]
        self.assertEqual(polled['incoming'][0]['id'],sent['delivery_id'])
        with self.app.auth.db() as db:db.execute('UPDATE studio_clients SET seen=? WHERE id=?',(time.time()-91,self.clients[1]))
        self.assertEqual(self.send()[0],404)
        self.beat(1,'midi-tab',self.b,self.cb)
        self.assertEqual(self.send()[0],200)

    def test_connection_and_delivery_tables_are_bounded(self):
        self.setup_pair()
        with self.app.auth.db() as db:
            for _ in range(62):db.execute('INSERT INTO studio_clients VALUES(?,?,?,?,?,?)',
                (self.alice['id'],uid(),self.app.auth.token_hash(self.a),'aurora','X',time.time()))
        self.assertEqual(self.beat(2,'auralis')[0],429)
        with self.app.auth.db() as db:db.execute('UPDATE studio_clients SET seen=?',(time.time()-100,))
        self.assertEqual(self.beat(2,'auralis')[0],200)

    def test_self_and_portal_cannot_be_receiving_tools(self):
        self.setup_pair();self.beat(2,'portal')
        self.assertEqual(self.send(target=self.clients[0])[0],400)
        self.assertEqual(self.send(target=self.clients[2])[0],400)

    def test_deleted_midi_is_not_delivered(self):
        self.setup_pair();self.app.user_store(self.alice['id']).delete(self.item['id'])
        self.assertEqual(self.send()[0],404)
