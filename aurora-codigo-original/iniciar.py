#!/usr/bin/env python3
"""Serve the bundled Aurora application on this computer only (Python 3.9+)."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import webbrowser


def main():
    parser = argparse.ArgumentParser(description="Abrir Aurora MIDI no navegador")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent / "dist"
    if not (directory / "index.html").is_file():
        print("A pasta dist está ausente. Extraia todo o ZIP antes de iniciar.", file=sys.stderr)
        return 1
    handler = partial(SimpleHTTPRequestHandler, directory=str(directory))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        print(f"Não foi possível iniciar: {error}. Feche outra cópia do Aurora ou use --port 8766.", file=sys.stderr)
        return 1
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"Aurora MIDI: {url}\nMantenha esta janela aberta. Ctrl+C para encerrar.", flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
