"""One-process demo server: the built site (site/dist) and the Ask API on one port, no nginx or Docker needed.

The Ask page posts to /api/ask; this mounts atlas.api under /api and serves site/dist for everything else.
For a demo on one machine only: no security headers, caching or TLS (deploy/nginx.conf has those).
Usage: .venv/bin/python tools/demo_server.py [--host 127.0.0.1] [--port 8080]
"""
import argparse
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP))

import uvicorn  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402
from starlette.staticfiles import StaticFiles  # noqa: E402

from atlas.api import app as api  # noqa: E402

DIST = APP / "site" / "dist"


class Site(StaticFiles):
    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as e:
            if e.status_code == 404 and (DIST / "404.html").exists():
                return FileResponse(DIST / "404.html", status_code=404)
            raise


def build():
    if not (DIST / "index.html").exists():
        sys.exit("site/dist not built: run ./build_site.sh first")
    root = FastAPI(docs_url=None, redoc_url=None)
    root.mount("/api", api)
    root.mount("/", Site(directory=DIST, html=True))
    return root


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8080)
    a = ap.parse_args()
    uvicorn.run(build(), host=a.host, port=a.port, log_level="warning")
