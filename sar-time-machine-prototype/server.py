"""Tiny stdlib-only server for the standalone SAR Time Machine prototype.

Serves the static frontend plus the minimal backend contract the player
needs:

  GET /                 -> index.html
  GET /styles.css       -> styles.css
  GET /app.js           -> app.js
  GET /api/series       -> JSON catalog { site, bbox, display_range, notice, frames[] }
  GET /frames/frame-NN.png -> synthetic grayscale PNG for that date
  GET /health           -> {"status": "ok", ...}

Why stdlib only?
  The prototype must run anywhere with `python server.py` — no pip install,
  no venv, no FastAPI. The real project backend (FastAPI + NISAR products)
  is a separate concern; this server only proves the browser player.

Why single-image frames instead of tiles?
  The real frontend uses Mapbox raster tiles (tile_url_template) per layer.
  Crossfading tiled maps is a different problem (tile loading, camera sync).
  For the prototype we pre-render one coregistered image per date so the
  preload / crossfade / swipe interaction can be validated in isolation.
  See README.md "Mapping to the real backend" for how to adapt this to
  /api/sites/{id} + product layers later.

Run:
  python server.py                 # http://127.0.0.1:8765
  python server.py --port 8000 --host 0.0.0.0

Bind 0.0.0.0 by default so the Arena live preview can reach it.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import synthetic

ROOT = Path(__file__).resolve().parent


class Handler(BaseHTTPRequestHandler):
    server_version = "SarTimeMachinePrototype/1.0"

    # -- helpers ---------------------------------------------------------
    def _send_bytes(self, body: bytes, content_type: str, cache: str = "no-cache") -> None:
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _send_404(self, message: str = "Not found") -> None:
        self._send_json({"detail": message}, status=404)

    def log_message(self, fmt: str, *args) -> None:  # keep logs readable
        print(f"{self.address_string()} - {fmt % args}")

    # -- routing ---------------------------------------------------------
    def do_GET(self) -> None:
        self._route()

    def do_HEAD(self) -> None:
        self._route()

    def _route(self) -> None:
        path = urlparse(self.path).path

        if path == "/" or path == "/index.html":
            body = (ROOT / "index.html").read_bytes()
            return self._send_bytes(body, "text/html; charset=utf-8")

        if path in ("/styles.css", "/app.js"):
            body = (ROOT / path.lstrip("/")).read_bytes()
            ctype = mimetypes.guess_type(path)[0] or "text/plain"
            return self._send_bytes(body, ctype)

        if path == "/api/series":
            return self._send_json(synthetic.series_catalog())

        if path == "/health":
            catalog = synthetic.series_catalog()
            return self._send_json(
                {
                    "status": "ok",
                    "frames": len(catalog["frames"]),
                    "bbox": catalog["bbox"],
                    "synthetic": True,
                }
            )

        if path.startswith("/frames/frame-") and path.endswith(".png"):
            stem = path[len("/frames/frame-") : -len(".png")]
            try:
                index = int(stem)
            except ValueError:
                return self._send_404("Unknown frame")
            try:
                body = synthetic.get_frame_png(index)
            except IndexError:
                return self._send_404("Unknown frame")
            return self._send_bytes(body, "image/png", cache="public, max-age=3600")

        return self._send_404(f"No route for {path}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SAR Time Machine prototype server (stdlib only).")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default 0.0.0.0 for preview)")
    parser.add_argument("--port", type=int, default=8765, help="Bind port (default 8765)")
    args = parser.parse_args(argv)

    # Warm the cache so the first /api/series + first frame are fast.
    # (Generation is deterministic; this is just to avoid a slow first hit.)
    print(f"Generating {len(synthetic.frame_dates())} synthetic frames…")
    for i in range(len(synthetic.frame_dates())):
        synthetic.get_frame_png(i)
    print("Frames ready.")

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"SAR Time Machine prototype on http://{args.host}:{args.port}/")
    print("  /api/series  /frames/frame-NN.png  /health")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
