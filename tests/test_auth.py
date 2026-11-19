"""Testes HTTP de contas, sessões, CSRF e isolamento entre usuários."""
import hashlib
import http.client
import json
import time
import unittest
import test_server as base


class AuthTests(base.ServerTests):
    def raw(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection(*self.http.server_address, timeout=5)
        conn.request(method, path, body=body, headers=headers or {})
        r = conn.getresponse()
        result = r.status, dict(r.getheaders()), r.read()
        conn.close()
        return result

    def account_request(self, action, username='bob', password='bob-test-password'):
        return self.raw('POST', '/api/auth/'+action, json.dumps({'username':username,'password':password}),
                        {'Content-Type':'application/json','X-MIDI-Share':'1'})

    def bob(self):
        code, headers, data = self.account_request('register')
        self.assertEqual(code, 201)
        return json.loads(data), headers['Set-Cookie'].split(';')[0]

    @staticmethod
    def actor(context, cookie):
        return {'Cookie':cookie,'X-MIDI-User':context['user']['id'],'X-CSRF-Token':context['csrf'],'X-MIDI-Share':'1'}

    def test_anonymous_cannot_list_download_or_open_apps(self):
        for path in ['/api/midis','/api/midis/'+'a'*32,'/api/midis/'+'a'*32+'/meta']:
            self.assertEqual(self.raw('GET',path)[0],401)
            self.assertEqual(self.raw('HEAD',path)[0],401)
        for path in ['/','/aurora/','/midi-tab/','/auralis/']:
            code,h,_=self.raw('GET',path)
            self.assertEqual(code,303)
            self.assertTrue(h['Location'].startswith('/login.html'))
        self.assertEqual(self.raw('GET','/login.html')[0],200)

    def test_register_cookie_flags_and_no_password_in_response(self):
        code,h,body=self.account_request('register')
        self.assertEqual(code,201)
        self.assertIn('HttpOnly',h['Set-Cookie']);self.assertIn('SameSite=Strict',h['Set-Cookie'])
        self.assertNotIn(b'bob-test-password',body)
        self.assertEqual(h['Cache-Control'],'no-store, private')

    def test_wrong_password_and_unknown_account_are_generic(self):
        self.bob()
        a=self.account_request('login',password='wrong-password')
        b=self.account_request('login',username='nonexistent',password='wrong-password')
        self.assertEqual((a[0],b[0]),(401,401))
        self.assertEqual(json.loads(a[2])['error'],json.loads(b[2])['error'])

    def test_usernames_are_case_insensitive_and_unique(self):
        self.bob()
        self.assertEqual(self.account_request('register',username='BOB')[0],409)
        self.assertEqual(self.account_request('login',username='BOB')[0],200)

    def test_invalid_credentials_cannot_create_accounts(self):
        for name,password in [('../evil','valid-password'),('valid','short'),('valid',42),('x'*40,'valid-password')]:
            self.assertEqual(self.account_request('register',name,password)[0],400)

    def test_passwords_have_distinct_salts_and_600k_hashes(self):
        self.bob();self.account_request('register','carol','bob-test-password')
        with self.http.auth.db() as db:
            rows=db.execute("SELECT salt,digest,iterations FROM users WHERE username in ('bob','carol')").fetchall()
        self.assertEqual(len(rows),2);self.assertNotEqual(rows[0]['salt'],rows[1]['salt'])
        self.assertNotEqual(rows[0]['digest'],rows[1]['digest'])
        self.assertTrue(all(row['iterations']>=600000 for row in rows))
        self.assertNotIn(b'bob-test-password',self.http.auth.path.read_bytes())

    def test_list_is_private_and_foreign_ids_are_404(self):
        item=json.loads(self.upload()[2])['item'];ctx,cookie=self.bob();headers=self.actor(ctx,cookie)
        listing=json.loads(self.raw('GET','/api/midis',headers=headers)[2])
        self.assertEqual(listing['items'],[])
        for suffix in ['', '/meta']:
            path='/api/midis/'+item['id']+suffix
            self.assertEqual(self.raw('GET',path,headers=headers)[0],404)
            self.assertEqual(self.raw('HEAD',path,headers=headers)[0],404)
        self.assertEqual(self.request('GET','/api/midis/'+item['id'])[0],200)

    def test_client_cannot_choose_another_owner(self):
        ctx,cookie=self.bob()
        code,_,data=self.request('POST','/api/midis?name=owner.mid&owner='+ctx['user']['id'],self.midi,{'X-MIDI-Share':'1'})
        self.assertEqual(code,201)
        self.assertEqual(len(self.store.list()),1)
        self.assertEqual(self.http.user_store(ctx['user']['id']).list(),[])

    def test_same_upload_key_is_scoped_to_owner(self):
        key='shared-upload-key-123'
        self.assertEqual(self.upload(extra={'X-MIDI-Upload-ID':key})[0],201)
        ctx,cookie=self.bob();headers={**self.actor(ctx,cookie),'X-MIDI-Upload-ID':key}
        code,_,body=self.raw('POST','/api/midis?name=bob.mid&source=Auralis',self.midi,headers)
        self.assertEqual(code,201)
        self.assertEqual(json.loads(body)['item']['source'],'Auralis')
        self.assertEqual(len(self.http.user_store(ctx['user']['id']).list()),1)

    def test_missing_wrong_or_non_ascii_csrf_is_rejected(self):
        for value in ['', 'wrong', '\xe9']:
            headers={'Cookie':self.cookie,'X-MIDI-User':self.user['id'],'X-MIDI-Share':'1','X-CSRF-Token':value}
            self.assertEqual(self.raw('POST','/api/midis?name=x.mid',self.midi,headers)[0],403)
        self.assertEqual(self.store.list(),[])

    def test_old_tab_cannot_upload_under_new_account(self):
        ctx,cookie=self.bob()
        old={'Cookie':cookie,'X-MIDI-Share':'1','X-MIDI-User':self.user['id'],'X-CSRF-Token':self.context['csrf']}
        self.assertEqual(self.raw('POST','/api/midis?name=x.mid',self.midi,old)[0],409)
        self.assertEqual(self.raw('GET','/api/midis',headers=old)[0],409)
        self.assertEqual(self.http.user_store(ctx['user']['id']).list(),[])

    def test_logout_revokes_token(self):
        headers=self.actor(self.context,self.cookie)
        code,h,_=self.raw('POST','/api/auth/logout',headers=headers)
        self.assertEqual(code,200);self.assertIn('Max-Age=0',h['Set-Cookie'])
        self.assertEqual(self.raw('GET','/api/midis',headers=headers)[0],401)

    def test_forged_or_expired_sessions_are_denied(self):
        self.assertEqual(self.raw('GET','/api/midis',headers={'Cookie':'midishare_session='+'a'*43})[0],401)
        with self.http.auth.db() as db:db.execute('UPDATE sessions SET expires=0')
        self.assertEqual(self.request('GET','/api/midis')[0],401)

    def test_idle_session_expires(self):
        with self.http.auth.db() as db:db.execute('UPDATE sessions SET seen=?',(time.time()-1900,))
        self.assertEqual(self.request('GET','/api/midis')[0],401)

    def test_restart_keeps_accounts_and_sessions(self):
        fresh=base.server.AuthStore(self.http.auth.directory)
        self.assertEqual(fresh.session(self.token)['user'],self.user)
        self.assertEqual(fresh.login('testuser','test-password-only'),self.user)
        with fresh.db() as db:
            self.assertNotEqual(db.execute('SELECT token_hash FROM sessions').fetchone()[0],self.token)

    def test_rate_limit_is_enforced(self):
        for _ in range(6):self.account_request('login','unknown','bad-password')
        self.assertEqual(self.account_request('login','unknown','bad-password')[0],429)

    def test_login_cross_origin_and_simple_form_are_blocked(self):
        body=json.dumps({'username':'bob','password':'bob-test-password'})
        for headers in [{'Content-Type':'application/json'}, {'Content-Type':'application/json','X-MIDI-Share':'1','Origin':'http://elsewhere.invalid'}]:
            self.assertEqual(self.raw('POST','/api/auth/login',body,headers)[0],403)

    def test_private_cache_and_html_context(self):
        self.upload()
        for path in ['/api/midis','/aurora/','/midi-tab/','/auralis/']:
            code,h,data=self.request('GET',path)
            self.assertEqual(code,200);self.assertEqual(h['Cache-Control'],'no-store, private')
            if path.endswith('/'):
                self.assertIn(self.user['id'].encode(),data);self.assertIn(b'globalThis.MidiShareSession=',data)
                self.assertNotIn(b'<!--MIDI_AUTH_CONTEXT-->',data)

    def test_legacy_files_are_not_auto_assigned(self):
        self.http.store.save('legacy.mid','Portal',self.midi)
        self.assertEqual(json.loads(self.request('GET','/api/midis')[2])['items'],[])

    def test_data_and_account_database_have_no_static_route(self):
        for path in ['/dados/midis/contas.sqlite3','/usuarios/'+self.user['id']+'/midis/','/../dados/midis/contas.sqlite3','/%2e%2e/dados/midis/contas.sqlite3']:
            self.assertEqual(self.raw('GET',path)[0],404)

    def test_aurora_storage_is_namespaced(self):
        text=(base.ROOT/'web/aurora/index.html').read_text()
        self.assertNotIn('indexedDB.open("aurora-midi-v2"',text)
        self.assertNotIn('localStorage.getItem("aurora-midi-v2")',text)
        self.assertIn('globalThis.MidiShareSession.user.id + "-aurora-v2"',text)

    def test_legacy_import_is_explicit_repeatable_and_preserves_original(self):
        import subprocess, sys
        self.bob()
        legacy = self.http.store.save('old.mid', 'Aurora', self.midi)
        cmd=[sys.executable,str(base.ROOT/'iniciar.py'),'--data',str(self.http.store.directory),'--import-legacy-to','bob']
        for _ in range(2):
            result=subprocess.run(cmd,capture_output=True,text=True,timeout=10)
            self.assertEqual(result.returncode,0,result.stderr)
        destination=self.http.user_store(self.http.auth.user('bob')['id'])
        self.assertEqual(len(destination.list()),1)
        self.assertEqual(self.http.store.read(legacy['id'])[1],self.midi)

    def test_tls_login_marks_cookie_secure(self):
        import subprocess, shutil, ssl, threading
        from pathlib import Path
        if not shutil.which('openssl'):
            self.skipTest('OpenSSL CLI não disponível')
        cert=Path(self.temp.name)/'test-cert.pem';key=Path(self.temp.name)/'test-key.pem'
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1',
                        '-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost',
                        '-keyout',str(key),'-out',str(cert)],check=True,capture_output=True)
        secure=base.server.MidiHTTPServer(('127.0.0.1',0),self.http.store)
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(cert,key)
        secure.socket=context.wrap_socket(secure.socket,server_side=True,do_handshake_on_connect=False)
        thread=threading.Thread(target=secure.serve_forever,daemon=True);thread.start()
        try:
            conn=http.client.HTTPSConnection('localhost',secure.server_port,context=ssl.create_default_context(cafile=str(cert)))
            conn.request('POST','/api/auth/login',json.dumps({'username':'testuser','password':'test-password-only'}),
                         {'X-MIDI-Share':'1','Content-Type':'application/json','Origin':f'https://localhost:{secure.server_port}'})
            response=conn.getresponse();response.read();self.assertEqual(response.status,200)
            self.assertIn('; Secure',response.getheader('Set-Cookie'));conn.close()
        finally:
            secure.shutdown();secure.server_close();thread.join()

    def test_path_aliases_cannot_bypass_authentication(self):
        for path in ['/shared/../aurora/','/shared/../midi-tab/','/shared/../auralis/']:
            self.assertEqual(self.raw('GET',path)[0],303)
        self.assertEqual(self.raw('GET','/shared/../api/midis')[0],401)

for _name in vars(base.ServerTests):
    if _name.startswith('test_'):
        setattr(AuthTests,_name,None)
