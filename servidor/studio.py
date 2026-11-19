"""Presença e entregas de MIDI entre aplicativos da mesma conta.

O MIDI permanece no catálogo. A fila guarda referências, nunca senhas ou bytes.
"""
import re
import time
import uuid

ID = re.compile(r'^[0-9a-f]{32}$')
APPS = ('aurora', 'auralis', 'midi-tab', 'portal')
LIVE_SECONDS = 90
DELIVERY_SECONDS = 3600
HISTORY_SECONDS = 86400


class StudioError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def identifier(value):
    if not isinstance(value, str) or not ID.fullmatch(value):
        raise StudioError('Identificador de conexão inválido.')
    return value


class StudioStore:
    def __init__(self, auth):
        self.auth = auth
        with auth.db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS studio_clients (
                  owner TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL,
                  session_hash TEXT NOT NULL, app TEXT NOT NULL,
                  label TEXT NOT NULL, seen REAL NOT NULL, PRIMARY KEY(owner,id));
                CREATE INDEX IF NOT EXISTS studio_seen ON studio_clients(seen);
                CREATE TABLE IF NOT EXISTS studio_deliveries (
                  id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id),
                  request_id TEXT NOT NULL, sender TEXT NOT NULL, target TEXT NOT NULL,
                  source_app TEXT NOT NULL, source_label TEXT NOT NULL,
                  midi_id TEXT NOT NULL, state TEXT NOT NULL, created REAL NOT NULL,
                  UNIQUE(owner,request_id));
                CREATE INDEX IF NOT EXISTS studio_inbox
                  ON studio_deliveries(owner,target,state,created);
            ''')

    @staticmethod
    def clean(db, now):
        db.execute('DELETE FROM studio_clients WHERE seen < ?', (now - HISTORY_SECONDS,))
        db.execute('DELETE FROM studio_deliveries WHERE created < ?', (now - HISTORY_SECONDS,))

    @staticmethod
    def client(db, owner, client_id, session_hash):
        row = db.execute('SELECT * FROM studio_clients WHERE owner=? AND id=?',
                         (owner, identifier(client_id))).fetchone()
        if row is None or row['session_hash'] != session_hash:
            raise StudioError('Reconecte este aplicativo ao host.', 404)
        return row

    def heartbeat(self, owner, session_hash, data):
        if set(data) != {'client_id', 'app', 'label'} or data['app'] not in APPS:
            raise StudioError('Aplicativo de destino inválido.')
        client_id = identifier(data['client_id'])
        label = data['label']
        if not isinstance(label, str) or not 1 <= len(label.strip()) <= 64 or any(ord(c) < 32 for c in label):
            raise StudioError('Use um nome de conexão de 1 a 64 caracteres.')
        now = time.time()
        with self.auth.db() as db:
            db.execute('BEGIN IMMEDIATE')
            self.clean(db, now)
            old = db.execute('SELECT * FROM studio_clients WHERE owner=? AND id=?', (owner, client_id)).fetchone()
            if old and (old['session_hash'] != session_hash or old['app'] != data['app']):
                raise StudioError('Identificador usado por outra conexão.', 409)
            if old is None:
                count = db.execute('SELECT COUNT(*) FROM studio_clients WHERE owner=?', (owner,)).fetchone()[0]
                total = db.execute('SELECT COUNT(*) FROM studio_clients').fetchone()[0]
                if count >= 64 or total >= 2048:
                    # Somente conexões inativas podem ser removidas para abrir espaço.
                    db.execute('DELETE FROM studio_clients WHERE seen < ?', (now - LIVE_SECONDS,))
                    count = db.execute('SELECT COUNT(*) FROM studio_clients WHERE owner=?', (owner,)).fetchone()[0]
                    total = db.execute('SELECT COUNT(*) FROM studio_clients').fetchone()[0]
                    if count >= 64 or total >= 2048:
                        raise StudioError('Muitas conexões abertas. Feche outras abas e aguarde.', 429)
            db.execute('INSERT INTO studio_clients VALUES(?,?,?,?,?,?) '
                       'ON CONFLICT(owner,id) DO UPDATE SET label=excluded.label,seen=excluded.seen',
                       (owner, client_id, session_hash, data['app'], label.strip(), now))
        return {'client_id': client_id, 'heartbeat_seconds': 20}

    def poll(self, owner, session_hash, client_id):
        now = time.time()
        with self.auth.db() as db:
            self.client(db, owner, client_id, session_hash)
            # Sessões revogadas deixam de aparecer imediatamente, mesmo antes do TTL.
            rows = db.execute('''SELECT c.id,c.app,c.label FROM studio_clients c
                JOIN sessions s ON s.token_hash=c.session_hash
                WHERE c.owner=? AND c.seen>? AND s.expires>? AND s.seen+s.idle_seconds>?
                ORDER BY c.app,c.label LIMIT 64''', (owner, now - LIVE_SECONDS, now, now)).fetchall()
            incoming = db.execute('''SELECT id,midi_id,source_app,source_label,created
                FROM studio_deliveries WHERE owner=? AND target=? AND state='pending'
                AND created>? ORDER BY created,id LIMIT 16''',
                (owner, client_id, now - DELIVERY_SECONDS)).fetchall()
        return {'clients': [dict(r) for r in rows], 'incoming': [dict(r) for r in incoming],
                'poll_seconds': 3, 'delivery_seconds': DELIVERY_SECONDS}

    def send(self, owner, session_hash, data):
        if set(data) != {'client_id', 'target', 'midi_id', 'request_id'}:
            raise StudioError('Pedido de entrega inválido.')
        for value in data.values():
            identifier(value)
        now = time.time()
        with self.auth.db() as db:
            db.execute('BEGIN IMMEDIATE')
            self.clean(db, now)
            sender = self.client(db, owner, data['client_id'], session_hash)
            old = db.execute('SELECT * FROM studio_deliveries WHERE owner=? AND request_id=?',
                             (owner, data['request_id'])).fetchone()
            if old:
                if (old['sender'], old['target'], old['midi_id']) != (data['client_id'], data['target'], data['midi_id']):
                    raise StudioError('Identificador já usado para outra entrega.', 409)
                return {'delivery_id': old['id'], 'state': old['state'], 'replayed': True}
            target = db.execute('''SELECT c.* FROM studio_clients c JOIN sessions s ON s.token_hash=c.session_hash
                WHERE c.owner=? AND c.id=? AND c.seen>? AND s.expires>? AND s.seen+s.idle_seconds>?''',
                (owner, data['target'], now - LIVE_SECONDS, now, now)).fetchone()
            if target is None:
                raise StudioError('O aplicativo de destino desconectou. Atualize as conexões.', 404)
            if target['id'] == sender['id'] or target['app'] == 'portal':
                raise StudioError('Escolha outra ferramenta para receber o MIDI.')
            count = db.execute('SELECT COUNT(*) FROM studio_deliveries WHERE owner=?', (owner,)).fetchone()[0]
            total = db.execute('SELECT COUNT(*) FROM studio_deliveries').fetchone()[0]
            if count >= 256 or total >= 10000:
                raise StudioError('Limite diário de entregas atingido. Use a biblioteca.', 429)
            delivery_id = uuid.uuid4().hex
            db.execute('INSERT INTO studio_deliveries VALUES(?,?,?,?,?,?,?,?,?,?)',
                       (delivery_id, owner, data['request_id'], sender['id'], target['id'],
                        sender['app'], sender['label'], data['midi_id'], 'pending', now))
        return {'delivery_id': delivery_id, 'state': 'pending', 'replayed': False}

    def ack(self, owner, session_hash, data):
        if set(data) != {'client_id', 'delivery_id', 'state'} or data['state'] not in ('accepted', 'dismissed'):
            raise StudioError('Confirmação de entrega inválida.')
        identifier(data['delivery_id'])
        with self.auth.db() as db:
            self.client(db, owner, data['client_id'], session_hash)
            row = db.execute('SELECT * FROM studio_deliveries WHERE owner=? AND id=? AND target=?',
                             (owner, data['delivery_id'], data['client_id'])).fetchone()
            if row is None:
                raise StudioError('Entrega não encontrada.', 404)
            if row['state'] != 'pending' and row['state'] != data['state']:
                raise StudioError('Esta entrega já foi confirmada com outro resultado.', 409)
            db.execute('UPDATE studio_deliveries SET state=? WHERE id=?', (data['state'], row['id']))
        return {'ok': True, 'state': data['state']}
