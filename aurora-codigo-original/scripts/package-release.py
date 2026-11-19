#!/usr/bin/env python3
"""Publish a complete, verified ZIP atomically; never expose a growing output file."""
import argparse
import os
from pathlib import Path
import tempfile
import zipfile


def collect_files(root):
    files = []
    for directory in ["dist", "src", "docs", "vendor-source", "scripts", "tests"]:
        for file in (root / directory).rglob("*"):
            if not file.is_file() or file.is_symlink():
                continue
            relative = file.relative_to(root)
            if any(p.startswith(".") or p in {"node_modules", "__pycache__"} for p in relative.parts):
                continue
            if file.suffix in {".zip", ".pyc"} or relative.as_posix() == "dist/Aurora-MIDI.html":
                continue
            files.append(file)
    for name in ["README.md", "MUDANCAS.md", "TESTES.md", "THIRD-PARTY-NOTICES.txt", "package.json", "package-lock.json", "iniciar.py", "Iniciar-Aurora.bat", "iniciar-aurora.sh"]:
        file = root / name
        if not file.is_file():
            raise FileNotFoundError(f"Arquivo obrigatório ausente: {name}")
        files.append(file)
    return sorted(files)


def release_entries(root):
    entries = [
        (root / "dist/Aurora-MIDI.html", "index.html"),
        (root / "dist/LEIA-ME.txt", "LEIA-ME.txt"),
        (root / "dist/README-EN.txt", "README-EN.txt"),
        (root / "TESTES.md", "TESTES.md"),
        (root / "THIRD-PARTY-NOTICES.txt", "LICENCAS/AVISOS.txt"),
    ]
    entries += [(file, "LICENCAS/" + file.name) for file in sorted((root / "dist/vendor").glob("*.txt"))]
    entries.append((root / "dist/LAME-LICENSE.txt", "LICENCAS/LAME-LICENSE.txt"))
    entries += [(file, "codigo-fonte/" + file.relative_to(root).as_posix()) for file in collect_files(root)]
    return entries


def validate_archive(archive_path, entries):
    with zipfile.ZipFile(archive_path) as archive:
        if archive.namelist() != [name for _, name in entries]:
            raise ValueError("A lista de arquivos do ZIP está incompleta ou fora de ordem")
        bad = archive.testzip()
        if bad:
            raise ValueError(f"CRC inválido: {bad}")
        for source, name in entries:
            if archive.read(name) != source.read_bytes():
                raise ValueError(f"O conteúdo empacotado difere do fonte: {name}")


def package_release(root, output):
    root, output = Path(root).resolve(), Path(output).absolute()
    if output.suffix.lower() != ".zip":
        raise ValueError("A saída deve ter extensão .zip")
    # Collect before creating the temporary file, so neither it nor existing ZIPs
    # can be recursively included in the package.
    entries = release_entries(root)
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".aurora-building-", suffix=".tmp", dir=output.parent)
    os.close(fd)
    temporary = Path(name)
    try:
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=False) as archive:
            for source, archive_name in entries:
                archive.write(source, archive_name)
        # The central directory exists only after ZipFile.close(). Check every
        # byte and CRC before an atomic rename makes the final name visible.
        validate_archive(temporary, entries)
        with temporary.open("rb") as completed:
            os.fsync(completed.fileno())
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    return {"output": str(output), "entries": len(entries), "bytes": output.stat().st_size}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(package_release(Path(__file__).resolve().parent.parent, args.output))


if __name__ == "__main__":
    main()
