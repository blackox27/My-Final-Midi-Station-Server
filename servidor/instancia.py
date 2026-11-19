"""Trava de instância para hosts Windows e Unix que usam a mesma pasta."""
from pathlib import Path
import os


class DataLease:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.handle = None

    def acquire(self):
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        handle = (self.directory / '.midishare.lock').open('a+b')
        try:
            if os.name == 'nt':
                import msvcrt
                if handle.seek(0, 2) == 0:
                    handle.write(b'0')
                    handle.flush()
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            handle.close()
            raise OSError('Já existe um processo MIDI Share usando essa pasta de dados.')
        self.handle = handle
        return self

    def close(self):
        if self.handle is not None:
            self.handle.close()
            self.handle = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
