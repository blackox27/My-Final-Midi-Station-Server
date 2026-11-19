"""Host real com túnel simulado: não publica serviços nem acessa Cloudflare."""
import http.client
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.parse import parse_qs,urlsplit

from servidor.host import invite,PORTAL,QuickTunnel
from servidor.instancia import DataLease

ROOT=Path(__file__).resolve().parents[1]

class HostTests(unittest.TestCase):
    def test_invite_points_to_exact_project_and_contains_only_host_address(self):
        value=invite('https://example.trycloudflare.com');u=urlsplit(value)
        self.assertEqual(u.netloc,'blackox27.github.io')
        self.assertEqual(u.path,'/My-Final-Midi-Station-Online/conta.html')
        self.assertEqual(parse_qs(u.fragment),{'host':['https://example.trycloudflare.com']})

    def test_data_lease_rejects_second_instance_and_releases(self):
        with tempfile.TemporaryDirectory() as d:
            with DataLease(d).acquire():
                with self.assertRaises(OSError):DataLease(d).acquire()
            DataLease(d).acquire().close()

    def test_real_host_local_and_public_proxy_modes_keep_accounts_after_restart(self):
        if os.name=='nt':self.skipTest('Teste de processo usa sinais Unix; o launcher também inclui arquivos Windows.')
        with tempfile.TemporaryDirectory() as d:
            data=Path(d)/'data';stub=Path(d)/'cloudflared-stub'
            stub.write_text('#!'+sys.executable+'\nimport time\nprint("https://test-midi.trycloudflare.com",flush=True)\nwhile True:time.sleep(1)\n');stub.chmod(0o700)
            def run(internet):
                with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
                log=(Path(d)/('internet.log' if internet else 'local.log')).open('w')
                args=[sys.executable,'iniciar-host.py','--data',str(data),'--port',str(port)]
                if internet:args+=['--internet','--cloudflared',str(stub)]
                child=subprocess.Popen(args,cwd=ROOT,stdout=log,stderr=log)
                def req(method,path,body=None,override=None):
                    h={}
                    if internet:h={'Host':'test-midi.trycloudflare.com','Origin':'https://test-midi.trycloudflare.com','X-Forwarded-Proto':'https','CF-Connecting-IP':'192.0.2.10'}
                    h.update(override or {})
                    c=http.client.HTTPConnection('127.0.0.1',port,timeout=3)
                    c.request(method,path,body,headers=h);r=c.getresponse();out=(r.status,dict(r.getheaders()),r.read());c.close();return out
                for _ in range(150):
                    try:
                        if req('GET','/api/health')[0]==200:return child,log,req
                    except OSError:pass
                    if child.poll() is not None:break
                    time.sleep(.03)
                child.terminate();child.wait(timeout=10);log.close();self.fail('Host não iniciou: '+(Path(d)/('internet.log' if internet else 'local.log')).read_text())
            def close(child,log):
                child.send_signal(signal.SIGINT)
                try:child.wait(timeout=10)
                finally:
                    if child.poll() is None:child.kill();child.wait(timeout=5)
                    log.close()
            child,log,req=run(False)
            credentials=json.dumps({'username':'hostuser','password':'host-test-password'})
            headers={'Content-Type':'application/json','X-MIDI-Share':'1'}
            try:
                self.assertEqual(req('POST','/api/auth/register',credentials,headers)[0],201)
                self.assertEqual(json.loads((data/'host-info.json').read_text())['portal'],PORTAL)
            finally:close(child,log)
            child,log,req=run(True)
            try:
                code,h,body=req('POST','/api/auth/login',credentials,headers)
                self.assertEqual(code,200);self.assertIn('__Host-',h.get('Set-Cookie',h.get('set-cookie','')));self.assertIn('Secure',h.get('Set-Cookie',h.get('set-cookie','')))
                self.assertEqual(req('GET','/api/health',override={'CF-Connecting-IP':'invalid'})[0],400)
                self.assertEqual(req('GET','/api/health',override={'X-Forwarded-Proto':'http'})[0],400)
                self.assertEqual(req('GET','/api/health',override={'Host':'evil.example'})[0],400)
                self.assertEqual(json.loads((data/'host-info.json').read_text())['host'],'https://test-midi.trycloudflare.com')
            finally:close(child,log)
