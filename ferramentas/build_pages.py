"""Gera apenas os arquivos públicos do MIDI Share para GitHub Pages."""
from __future__ import annotations

import argparse
from html import escape
import os
from pathlib import Path
import re
import shutil
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from servidor.aplicacao import origin_host

WEB = ROOT / 'web'
TEMPLATES = ROOT / 'ferramentas' / 'pages'
BUILD_MARKER = '<!-- MIDI Share: site público gerado -->'
PRIVATE_FILES = ('auth-guard.js', 'network-api.js', 'network.js', 'auth.css', 'network.css', 'tab-bridge.js', 'studio.js', 'studio.css')
AURORA_STORAGE = '"midishare-" + globalThis.MidiShareSession.user.id + "-aurora-v2"'
AURORA_PUBLIC_STORAGE = '("midishare-public-aurora-v2:" + location.pathname.replace(/index\\.html$/, ""))'
OMIT_DIRS = {'node_modules', '__pycache__', '.git'}
OMIT_EXTENSIONS = ('.pyc', '.db', '.db-wal', '.db-shm', '.sqlite', '.sqlite3',
                   '.sqlite3-wal', '.sqlite3-shm', '.pem', '.key', '.p12', '.pfx')


def checked_file(path, root):
    if path.resolve() != path or not path.is_relative_to(root) or not path.is_file():
        raise ValueError(f'Arquivo de origem inválido: {path}')
    return path


def files(directory):
    for dirpath, dirs, names in os.walk(directory):
        current = Path(dirpath)
        dirs[:] = sorted(d for d in dirs if d not in OMIT_DIRS and not d.startswith('.') and
                         not (current / d).is_symlink())
        for name in sorted(names):
            if not name.startswith('.') and not name.lower().endswith(OMIT_EXTENSIONS):
                yield checked_file(current / name, directory)


def copy_file(source, destination, root=ROOT):
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(checked_file(source, root), destination)


def copy_tree(source, destination):
    for path in files(source):
        copy_file(path, destination / path.relative_to(source), source)


def app_html(name):
    original = checked_file(WEB / name / 'index.html', WEB)
    html = original.read_text(encoding='utf-8').replace('<!--MIDI_AUTH_CONTEXT-->', '')
    for asset in PRIVATE_FILES:
        path = re.escape('/shared/' + asset)
        html = re.sub(r'<script src="' + path + r'"></script>|<link rel="stylesheet" href="' + path + r'">', '', html)
    html = html.replace('/shared/lan-compat.js', '../shared/lan-compat.js').replace('/shared/midi-interop.js', '../shared/midi-interop.js')
    if name == 'aurora':
        if html.count(AURORA_STORAGE) != 4:
            raise ValueError('As chaves do Aurora mudaram. Revise o isolamento do site público.')
        html = html.replace(AURORA_STORAGE, AURORA_PUBLIC_STORAGE)
    if re.search(r'(?:href|src)="/', html) or 'MidiShareSession' in html or 'MIDI_AUTH_CONTEXT' in html:
        raise ValueError(f'{name} precisa de adaptação para publicação em subpastas.')
    return html


def add_zip(zipped, arcname, data, mode=0o644):
    info = ZipInfo(arcname)
    info.external_attr = (0o100000 | (mode & 0o777)) << 16
    zipped.writestr(info, data, compress_type=ZIP_DEFLATED, compresslevel=6)


def add_source(zipped, directory, prefix):
    for path in files(directory):
        add_zip(zipped, f'{prefix}/{path.relative_to(directory).as_posix()}', path.read_bytes(), path.stat().st_mode)


def archives(site):
    aurora = site / 'aurora'
    with ZipFile(aurora / 'aurora-midi.zip', 'w') as zipped:
        html = (aurora / 'index.html').read_text(encoding='utf-8')
        helper = (site / 'shared' / 'lan-compat.js').read_text(encoding='utf-8')
        html = html.replace('<script src="../shared/lan-compat.js"></script>', '<script>' + helper + '</script>')
        add_zip(zipped, 'index.html', html.encode('utf-8'))
        for name in ('LEIA-ME.txt', 'README-EN.txt'):
            add_zip(zipped, name, (aurora / name).read_bytes())
        add_source(zipped, aurora / 'LICENCAS', 'LICENCAS')
        add_source(zipped, ROOT / 'aurora-codigo-original', 'codigo-fonte')
    with ZipFile(site / 'auralis' / 'auralis-codigo-fonte.zip', 'w') as zipped:
        add_source(zipped, WEB / 'auralis' / 'source', 'auralis-codigo-fonte')


def populate(site, private_host=None):
    site.mkdir()
    (site / '.nojekyll').touch()
    source = (TEMPLATES / 'index.html').read_text(encoding='utf-8')
    html = source.replace('<head>', '<head>\n  ' + BUILD_MARKER, 1)
    (site / 'index.html').write_text(html, encoding='utf-8')
    account = (TEMPLATES / 'conta.html').read_text(encoding='utf-8')
    if private_host:
        origin = escape('https://' + private_host, quote=True)
        host = escape(private_host)
        access = (
            '<div class="account-actions">'
            f'<a class="button" rel="noreferrer" href="{origin}/login.html?next=%2F">Entrar</a>'
            f'<a class="button button-outline" rel="noreferrer" href="{origin}/login.html?modo=cadastro">Criar conta</a>'
            '</div>'
            f'<p class="account-note">Você vai continuar no servidor <strong>{host}</strong>. '
            'Digite sua senha somente na página HTTPS desse servidor.</p>'
        )
    else:
        access = ('<p class="account-note"><strong>Escolha um host para sua biblioteca:</strong> '
                  'inicie seu host ou use o endereço enviado pelo anfitrião. '
                  'As ferramentas públicas continuam disponíveis no portal.</p>')
    (site / 'conta.html').write_text(account.replace('<!--ACESSO_CONTA-->', access), encoding='utf-8')
    copy_file(TEMPLATES / 'estilo.css', site / 'estilo.css')
    copy_file(TEMPLATES / 'host-connect.js', site / 'host-connect.js')
    copy_file(WEB / 'shared' / 'lan-compat.js', site / 'shared' / 'lan-compat.js')
    copy_file(WEB / 'shared' / 'midi-interop.js', site / 'shared' / 'midi-interop.js')
    copy_file(ROOT / 'exemplos' / 'Estudo-em-Do.mid', site / 'exemplos' / 'Estudo-em-Do.mid')

    for app in ('auralis', 'aurora', 'midi-tab'):
        destination = site / app
        destination.mkdir()
        (destination / 'index.html').write_text(app_html(app), encoding='utf-8')
        if app != 'aurora':
            copy_tree(WEB / app / 'assets', destination / 'assets')

    for name in ('LEIA-ME.txt', 'README-EN.txt'):
        copy_file(WEB / 'aurora' / name, site / 'aurora' / name)
    copy_tree(WEB / 'aurora' / 'LICENCAS', site / 'aurora' / 'LICENCAS')
    copy_file(WEB / 'auralis' / 'LICENSE', site / 'auralis' / 'LICENSE')
    copy_tree(WEB / 'auralis' / 'docs', site / 'auralis' / 'docs')
    for name in ('SAMPLES.md', 'electric-CC0.txt', 'nylon-CC0.txt', 'ukulele-CC0.txt'):
        copy_file(WEB / 'midi-tab' / 'docs' / name, site / 'midi-tab' / 'docs' / name)
    archives(site)


def build(output, private_url=None):
    output = Path(output)
    if output.is_symlink():
        raise ValueError('A saída do site não pode ser um link simbólico.')
    output = output.resolve()
    protected = (WEB, ROOT / 'dados', TEMPLATES.parent, ROOT / 'aurora-codigo-original', ROOT / 'exemplos',
                 ROOT / 'servidor', ROOT / 'deploy', ROOT / '.github', ROOT / 'docs', ROOT / 'tests')
    if ROOT.is_relative_to(output) or any(p.is_relative_to(output) or output.is_relative_to(p) for p in protected):
        raise ValueError('Escolha uma pasta exclusiva para a saída do site.')
    if output.exists() and (not output.is_dir() or (any(output.iterdir()) and (
            not (output / 'index.html').is_file() or
            BUILD_MARKER not in (output / 'index.html').read_text(encoding='utf-8')[:500]))):
        raise ValueError('A saída precisa estar vazia ou ter sido criada por este gerador.')
    private_host = origin_host(private_url) if private_url else None
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='.pages-', dir=output.parent) as work:
        staged = Path(work) / 'novo'
        previous = Path(work) / 'anterior'
        populate(staged, private_host)
        if output.exists():
            output.rename(previous)
        try:
            staged.rename(output)
        except OSError:
            if previous.exists():
                previous.rename(output)
            raise
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=ROOT / 'site-publico', type=Path)
    parser.add_argument('--private-url', default=os.environ.get('MIDISHARE_PRIVATE_URL'))
    args = parser.parse_args()
    try:
        output = build(args.output, args.private_url)
    except (OSError, ValueError) as error:
        parser.exit(1, f'Não foi possível gerar o site: {error}\n')
    print(f'Site público gerado em {output}')


if __name__ == '__main__':
    main()
