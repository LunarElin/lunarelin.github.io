"""Local static preview, including .mjs MIME and optional font-failure QA."""
import argparse
import http.server
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=4174)
parser.add_argument('--no-font', action='store_true', help='QA only: return 404 for font files')
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.woff2': 'font/woff2'}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(root), **kw)

    def do_GET(self):
        if args.no_font and self.path.split('?')[0].endswith('.woff2'):
            self.send_error(404, 'Intentional font fallback QA')
        else:
            super().do_GET()

print(f'Preview: http://127.0.0.1:{args.port}/games/block-bloom/', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
