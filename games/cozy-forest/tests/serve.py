"""Serve the repository with consistent JavaScript MIME types on Windows."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8765)
args = parser.parse_args()
SimpleHTTPRequestHandler.extensions_map['.mjs'] = 'text/javascript'
root = Path(__file__).resolve().parents[3]
server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(SimpleHTTPRequestHandler, directory=str(root)))
print(f'http://127.0.0.1:{args.port}/games/cozy-forest/', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
