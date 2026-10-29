"""Serve the repository locally with an explicit JavaScript module MIME type."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class GameHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript",
        ".js": "text/javascript",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8123)
    arguments = parser.parse_args()
    if not 1 <= arguments.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    repository = Path(__file__).resolve().parents[3]
    handler = partial(GameHandler, directory=str(repository))
    with ThreadingHTTPServer(("127.0.0.1", arguments.port), handler) as server:
        print(f"http://127.0.0.1:{arguments.port}/games/acorn-guard/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
