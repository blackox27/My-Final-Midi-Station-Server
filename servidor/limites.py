"""Limite compartilhado de disco para uma instalação com um processo servidor."""
from contextlib import contextmanager
from pathlib import Path
import os
import shutil
import threading

from .storage import StorageFull


class DiskBudget:
    def __init__(self, directory, limit_bytes, reserve_bytes=16 * 1024 * 1024):
        self.directory = Path(directory).resolve()
        self.limit_bytes = limit_bytes
        self.reserve_bytes = reserve_bytes
        self.lock = threading.Lock()

    def used_bytes(self):
        total = 0
        pending = [self.directory]
        while pending:
            folder = pending.pop()
            with os.scandir(folder) as entries:
                for entry in entries:
                    try:
                        if entry.is_symlink():
                            raise OSError('A pasta de dados não pode conter links simbólicos.')
                        if entry.is_dir(follow_symlinks=False):
                            pending.append(Path(entry.path))
                        elif entry.is_file(follow_symlinks=False):
                            total += entry.stat(follow_symlinks=False).st_size
                    except FileNotFoundError:
                        # SQLite pode remover WAL/SHM quando fecha uma conexão.
                        continue
        return total

    @contextmanager
    def reserve(self, expected_bytes):
        # O mesmo lock serve às bibliotecas de todas as contas. Inclui metadados,
        # banco e arquivos órfãos; reenvios já confirmados não fazem reserva.
        with self.lock:
            if self.used_bytes() + expected_bytes > self.limit_bytes:
                raise StorageFull('O armazenamento total do site está cheio. Exclua MIDIs ou consulte o responsável.')
            if shutil.disk_usage(self.directory).free < expected_bytes + self.reserve_bytes:
                raise StorageFull('Pouco espaço livre na hospedagem. Consulte o responsável.')
            yield
