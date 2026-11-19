"""Contas persistentes em SQLite e sessões revogáveis com tokens opacos."""
from __future__ import annotations
import hashlib
import hmac
import re
import secrets
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

ITERATIONS = 600_000
SESSION_SECONDS = 12 * 60 * 60
IDLE_SECONDS = 30 * 60
REMEMBER_SECONDS = 30 * 24 * 60 * 60
REMEMBER_IDLE_SECONDS = 7 * 24 * 60 * 60
USER_PATTERN = re.compile(r'^[a-z0-9][a-z0-9_.-]{2,31}$')
COOKIE = 'midishare_session'


class AuthError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class RateLimiter:
    def __init__(self):
        self.lock = threading.Lock()
        self.attempts = {}
        self.next_cleanup = 0

    def check(self, ip, username):
        now = time.monotonic()
        with self.lock:
            # Limpa periodicamente, sem percorrer a tabela a cada tentativa.
            if now >= self.next_cleanup:
                self.attempts = {k: v for k, v in self.attempts.items() if v[0] > now - 60}
                self.next_cleanup = now + 15
            updates = {}
            for key, limit in [(('ip', ip), 20), (('user', ip, username), 6)]:
                beginning, count = self.attempts.get(key, (now, 0))
                if beginning <= now - 60:
                    beginning, count = now, 0
                if count >= limit or (key not in self.attempts and len(self.attempts) >= 8192):
                    raise AuthError('Muitas tentativas. Aguarde um minuto.', 429)
                updates[key] = beginning, count + 1
            self.attempts.update(updates)


class AuthStore:
    def __init__(self, directory, max_users=100, *, kdf_slots=4):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / 'contas.sqlite3'
        self.max_users = max_users
        self._kdf_slots = threading.BoundedSemaphore(kdf_slots)
        self._dummy_salt = secrets.token_bytes(16)
        self._dummy_digest = secrets.token_bytes(32)
        with self.db() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.executescript(f'''
                CREATE TABLE IF NOT EXISTS users (
                  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
                  salt BLOB NOT NULL, digest BLOB NOT NULL,
                  iterations INTEGER NOT NULL, created REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions (
                  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
                  csrf TEXT NOT NULL, created REAL NOT NULL, seen REAL NOT NULL, expires REAL NOT NULL,
                  idle_seconds INTEGER NOT NULL DEFAULT {IDLE_SECONDS});
                CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
            ''')
            # O banco da versão 2.0 não tinha esta coluna. Contas e tokens são preservados.
            db.execute('BEGIN IMMEDIATE')
            if 'idle_seconds' not in {row['name'] for row in db.execute('PRAGMA table_info(sessions)')}:
                db.execute(f'ALTER TABLE sessions ADD COLUMN idle_seconds INTEGER NOT NULL DEFAULT {IDLE_SECONDS}')
        try:
            self.path.chmod(0o600)
        except OSError:
            pass

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def username(value):
        if not isinstance(value, str):
            raise AuthError('Informe um nome de usuário válido.')
        name = value.strip().lower()
        if not USER_PATTERN.fullmatch(name):
            raise AuthError('Usuário: 3 a 32 caracteres, com letras, números, ponto, hífen ou _.')
        return name

    @staticmethod
    def password(value):
        if not isinstance(value, str) or not 10 <= len(value) <= 128:
            raise AuthError('A senha deve ter entre 10 e 128 caracteres.')
        return value.encode('utf-8')

    def derive(self, password, salt, iterations=ITERATIONS):
        if not self._kdf_slots.acquire(timeout=1):
            raise AuthError('Servidor ocupado. Tente novamente.', 503)
        try:
            return hashlib.pbkdf2_hmac('sha256', password, salt, iterations, dklen=32)
        finally:
            self._kdf_slots.release()

    def register(self, username, password):
        username = self.username(username)
        password = self.password(password)
        salt = secrets.token_bytes(16)
        digest = self.derive(password, salt)
        user_id = uuid.uuid4().hex
        try:
            with self.db() as db:
                db.execute('BEGIN IMMEDIATE')
                if db.execute('SELECT count(*) FROM users').fetchone()[0] >= self.max_users:
                    raise AuthError('Limite de contas atingido.', 409)
                db.execute('INSERT INTO users VALUES (?,?,?,?,?,?)',
                           (user_id, username, salt, digest, ITERATIONS, time.time()))
        except sqlite3.IntegrityError:
            raise AuthError('Não foi possível criar essa conta. Escolha outro usuário.', 409)
        return {'id': user_id, 'username': username}

    def login(self, username, password):
        username = self.username(username)
        if not isinstance(password, str) or not 1 <= len(password) <= 128:
            raise AuthError('Usuário ou senha inválidos.', 401)
        with self.db() as db:
            user = db.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
        digest = self.derive(password.encode('utf-8'), user['salt'] if user else self._dummy_salt,
                             user['iterations'] if user else ITERATIONS)
        if not hmac.compare_digest(digest, user['digest'] if user else self._dummy_digest) or not user:
            raise AuthError('Usuário ou senha inválidos.', 401)
        return {'id': user['id'], 'username': user['username']}

    @staticmethod
    def token_hash(token):
        return hashlib.sha256(token.encode('ascii')).hexdigest()

    def create_session(self, user, previous=None, *, remember=False):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        now = time.time()
        lifetime = REMEMBER_SECONDS if remember else SESSION_SECONDS
        idle = REMEMBER_IDLE_SECONDS if remember else IDLE_SECONDS
        with self.db() as db:
            db.execute('DELETE FROM sessions WHERE expires<=? OR seen + idle_seconds<=?', (now, now))
            if previous and re.fullmatch(r'[A-Za-z0-9_-]{43}', previous):
                db.execute('DELETE FROM sessions WHERE token_hash=?', (self.token_hash(previous),))
            # No máximo cinco sessões simultâneas por conta.
            db.execute('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN '
                       '(SELECT token_hash FROM sessions WHERE user_id=? ORDER BY created DESC LIMIT 4)',
                       (user['id'], user['id']))
            db.execute('INSERT INTO sessions (token_hash,user_id,csrf,created,seen,expires,idle_seconds) '
                       'VALUES (?,?,?,?,?,?,?)',
                       (self.token_hash(token), user['id'], csrf, now, now, now + lifetime, idle))
        return token, {'user': user, 'csrf': csrf}

    def session(self, token):
        if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
            return None
        digest = self.token_hash(token)
        now = time.time()
        with self.db() as db:
            row = db.execute('SELECT s.*, u.username FROM sessions s JOIN users u ON u.id=s.user_id '
                             'WHERE token_hash=?', (digest,)).fetchone()
            if row is None:
                return None
            if row['expires'] <= now or row['seen'] <= now - row['idle_seconds']:
                db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
                return None
            if row['seen'] < now - 60:
                db.execute('UPDATE sessions SET seen=? WHERE token_hash=?', (now, digest))
            return {'user': {'id': row['user_id'], 'username': row['username']}, 'csrf': row['csrf']}

    def logout(self, token):
        if token and re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
            with self.db() as db:
                db.execute('DELETE FROM sessions WHERE token_hash=?', (self.token_hash(token),))

    def set_password(self, username, password):
        user = self.user(username)
        password = self.password(password)
        salt = secrets.token_bytes(16)
        digest = self.derive(password, salt)
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('UPDATE users SET salt=?, digest=?, iterations=? WHERE id=?',
                       (salt, digest, ITERATIONS, user['id']))
            db.execute('DELETE FROM sessions WHERE user_id=?', (user['id'],))
        return user

    def user(self, username):
        username = self.username(username)
        with self.db() as db:
            row = db.execute('SELECT id, username FROM users WHERE username=?', (username,)).fetchone()
        if row is None:
            raise AuthError('Conta não encontrada.', 404)
        return dict(row)
