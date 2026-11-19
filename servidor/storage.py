"""Catálogo validado e publicação atômica, com compatibilidade com os dados 1.0."""
from __future__ import annotations

from contextlib import nullcontext

import hashlib
import json
import os
import re
import stat
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from .midi import safe_name, validate_midi

ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")
UPLOAD_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,80}$")
MAX_BYTES = 32 * 1024 * 1024
SOURCES = ("Aurora", "Portal", "MIDI Tab", "Auralis", "Cliente")
ITEM_KEYS = ("id", "name", "source", "created_at", "sha256", "size", "format", "tracks", "ppq", "notes", "upload_id")


class UploadConflict(ValueError):
    pass


class StorageFull(ValueError):
    pass


class MidiStore:
    def __init__(self, directory, max_files=2000, max_total_bytes=512 * 1024 * 1024, *, budget=None):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.budget = budget
        self.max_files = max_files
        self.max_total_bytes = max_total_bytes
        self._items = {}
        self._uploads = {}
        self._signature = None
        self._total_bytes = 0
        self._listing = None
        self.ignored = 0
        self.reload()

    def _signature_for(self, metadata):
        try:
            a, b = metadata.lstat(), metadata.with_suffix(".mid").lstat()
            if stat.S_ISREG(a.st_mode) and stat.S_ISREG(b.st_mode):
                return a.st_mtime_ns, a.st_ctime_ns, a.st_size, b.st_mtime_ns, b.st_ctime_ns, b.st_size
        except OSError:
            pass
        return None

    def _snapshot(self):
        with os.scandir(self.directory) as entries:
            return {entry.name[:-5]: self._signature_for(Path(entry.path))
                    for entry in entries if entry.name.endswith(".json") and ID_PATTERN.fullmatch(entry.name[:-5])}

    @staticmethod
    def _valid(item, item_id, size):
        if not isinstance(item, dict) or item.get("id") != item_id:
            return False
        if not all(isinstance(item.get(k), str) for k in ("name", "source", "created_at", "sha256")):
            return False
        if not re.fullmatch(r"[0-9a-f]{64}", item["sha256"]):
            return False
        try:
            # Mantém descrições antigas válidas, mas descarta UTF-8 irrepresentável.
            item["source"].encode("utf-8")
            if safe_name(item["name"]) != item["name"]:
                return False
            stamp = datetime.fromisoformat(item["created_at"])
            if stamp.tzinfo is None:
                return False
        except (ValueError, TypeError, OverflowError):
            return False
        for key in ("size", "format", "tracks", "ppq", "notes"):
            if type(item.get(key)) is not int:
                return False
        return (item["size"] == size and 0 < size <= MAX_BYTES and item["format"] in (0, 1)
                and 1 <= item["tracks"] <= 65535 and 1 <= item["ppq"] < 32768
                and 1 <= item["notes"] <= 1_000_000
                and ("upload_id" not in item or (isinstance(item["upload_id"], str)
                                                 and bool(UPLOAD_PATTERN.fullmatch(item["upload_id"])))))

    def _read_metadata(self, item_id, stamp):
        if stamp is None or stamp[2] > 65536:
            return None
        try:
            path = self.directory / f"{item_id}.json"
            item = json.loads(path.read_text(encoding="utf-8"))
            if self._valid(item, item_id, stamp[5]):
                # Somente arquivos novos/alterados passam por esta leitura.
                # Mesmo tamanho não significa mesmo conteúdo.
                digest = hashlib.sha256()
                with path.with_suffix(".mid").open("rb") as midi:
                    while chunk := midi.read(256 * 1024):
                        digest.update(chunk)
                if self._signature_for(path) == stamp and digest.hexdigest() == item["sha256"]:
                    return {key: item[key] for key in ITEM_KEYS if key in item}
        except (OSError, ValueError, TypeError, KeyError, RecursionError):
            pass
        return None

    @staticmethod
    def _public(item):
        return {key: value for key, value in item.items() if key != "upload_id"}

    def reload(self):
        with self.lock:
            signature = self._snapshot()
            if signature == self._signature:
                return
            items, uploads, ignored, total = {}, {}, 0, 0
            previous = self._signature or {}
            for item_id, stamp in signature.items():
                if item_id in previous and previous[item_id] == stamp:
                    item = self._items.get(item_id)
                else:
                    item = self._read_metadata(item_id, stamp)
                if item is None:
                    ignored += 1
                else:
                    items[item_id] = item
                    total += item["size"]
                    if "upload_id" in item:
                        uploads[item["upload_id"]] = item_id
            self._items, self._uploads = items, uploads
            self.ignored, self._signature, self._total_bytes = ignored, signature, total
            self._listing = None

    def listing(self):
        with self.lock:
            self.reload()
            if self._listing is None:
                ordered = sorted(self._items.values(), key=lambda i: (i["created_at"], i["id"]), reverse=True)
                payload = json.dumps({"items": [self._public(item) for item in ordered], "total": len(ordered),
                                      "total_bytes": self._total_bytes, "ignored": self.ignored},
                                     ensure_ascii=False, separators=(",", ":")).encode("utf-8")
                self._listing = payload, '"' + hashlib.sha256(payload).hexdigest() + '"'
            return self._listing

    def list(self):
        return json.loads(self.listing()[0])["items"]

    def save(self, name, source, data, upload_id=None):
        return self.accept(name, source, data, upload_id)[0]

    def accept(self, name, source, data, upload_id=None):
        if not 0 < len(data) <= MAX_BYTES:
            raise ValueError("Limite de 32 MiB por arquivo.")
        if upload_id is not None and not UPLOAD_PATTERN.fullmatch(upload_id):
            raise ValueError("Identificador de envio inválido.")
        name = safe_name(name)
        source = source if source in SOURCES else "Cliente"
        digest = hashlib.sha256(data).hexdigest()
        # A leitura e validação musical podem ocorrer em paralelo. Commit e replay
        # usam o mesmo lock, impedindo duas publicações do mesmo identificador.
        info = validate_midi(data)
        with self.lock:
            self.reload()
            if upload_id and upload_id in self._uploads:
                old = self._items[self._uploads[upload_id]]
                if (old["sha256"], old["name"], old["source"]) != (digest, name, source):
                    raise UploadConflict("Identificador já utilizado para outro envio.")
                return self._public(old), True
            if len(self._items) >= self.max_files or self._total_bytes + len(data) > self.max_total_bytes:
                raise StorageFull("Limite de armazenamento atingido. Consulte o responsável pelo servidor.")
            item_id = uuid.uuid4().hex
            item = {"id": item_id, "name": name, "size": len(data), "source": source,
                    "created_at": datetime.now(timezone.utc).isoformat(), "sha256": digest, **info}
            if upload_id:
                item["upload_id"] = upload_id
            midi_path = self.directory / f"{item_id}.mid"
            metadata = self.directory / f"{item_id}.json"
            temp = self.directory / f"{item_id}.tmp"
            midi_temp = self.directory / f"{item_id}.mid.tmp"
            reservation = self.budget.reserve(len(data) + 4096) if self.budget else nullcontext()
            with reservation:
                try:
                    with midi_temp.open("xb") as handle:
                        handle.write(data)
                        handle.flush()
                        os.fsync(handle.fileno())
                    os.replace(midi_temp, midi_path)
                    with temp.open("x", encoding="utf-8") as handle:
                        json.dump(item, handle, ensure_ascii=False)
                        handle.flush()
                        os.fsync(handle.fileno())
                    os.replace(temp, metadata)
                except Exception:
                    temp.unlink(missing_ok=True)
                    midi_temp.unlink(missing_ok=True)
                    midi_path.unlink(missing_ok=True)
                    raise
            self._items[item_id] = item
            if upload_id:
                self._uploads[upload_id] = item_id
            stamp = self._signature_for(metadata)
            if stamp is None:
                self._signature = None
            else:
                self._signature[item_id] = stamp
            self._total_bytes += len(data)
            self._listing = None
            return self._public(item), False

    def get(self, item_id):
        if not ID_PATTERN.fullmatch(item_id):
            raise FileNotFoundError
        with self.lock:
            stamp = self._signature_for(self.directory / f"{item_id}.json")
            if stamp is None:
                raise FileNotFoundError
            if self._signature is not None and self._signature.get(item_id) == stamp:
                item = self._items.get(item_id)
            else:
                item = self._read_metadata(item_id, stamp)
            if item is None:
                raise FileNotFoundError
            return self._public(item)

    def delete(self, item_id):
        with self.lock:
            with self.budget.lock if self.budget else nullcontext():
                item = self.get(item_id)
                metadata = self.directory / f"{item_id}.json"
                tombstone = self.directory / f"{item_id}.deleting"
                os.replace(metadata, tombstone)
                try:
                    self.path(item_id).unlink()
                except OSError:
                    os.replace(tombstone, metadata)
                    raise
                # Sem o JSON publicado, a música não reaparece mesmo se a limpeza
                # do marcador falhar. O limite global inclui esse resíduo no disco.
                try:
                    tombstone.unlink()
                except OSError:
                    pass
                self._signature = None
                self._listing = None
                return item

    def path(self, item_id):
        if not ID_PATTERN.fullmatch(item_id):
            raise FileNotFoundError
        path = self.directory / f"{item_id}.mid"
        if path.is_symlink():
            raise FileNotFoundError
        return path

    def read(self, item_id):
        item = self.get(item_id)
        return item, self.path(item_id).read_bytes()
