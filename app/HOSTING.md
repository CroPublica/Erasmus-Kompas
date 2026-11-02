# Hosting KA2 Atlas

The site is plain static files (`site/dist`). Only the **Ask** page needs a server: a small Python API (`atlas.api`) that calls
a local model through Ollama. Everything else works without it. Pick the lowest option that is enough.

## 1. Demo on this PC (current plan)

```
./demo.sh              # http://127.0.0.1:8080, this machine only
./demo.sh --lan        # reachable from other devices on the same network (http://<this-pc-ip>:8080)
PORT=9000 ./demo.sh    # another port
./demo.sh --rebuild    # re-export data and rebuild the site first
```

One process serves the site and the API (`tools/demo_server.py`). Needs `./setup.sh` and `./run_pipeline.sh` done once, and
Ollama running for Ask (`ollama serve`; models of the active profile in `config/models.yaml`, `./setup.sh --pull-models`).
No TLS, security headers or caching: fine for a demo, do not expose it to the internet. For a public address use option 2 or 3.

## 2. Static host for the site + the API on one small server

- Build: `SITE_URL=https://your.domain ./build_site.sh` (add `SITE_BASE=/atlas` if served under a sub-path).
- Upload `site/dist` to any static host (GitHub Pages, Netlify, an object-storage bucket); serve `404.html` for missing pages.
- Without the Ask page this is all that is needed, and it costs almost nothing.
- For Ask, run `uvicorn atlas.api:app --host 127.0.0.1 --port 8000` on a machine with Ollama and put it behind a reverse proxy
  at `/api/` (the page posts to `/api/ask`). The API already limits size (500 characters), rate (20 per minute per client) and concurrency.

## 3. Container on any server (nginx with security headers)

```
./build_site.sh --docker                 # image ka2-atlas (nginx, port 8080, strict content-security policy, caching)
docker run -d --rm -p 8080:8080 -e ASK_API_URL=http://host.docker.internal:8000 ka2-atlas
uvicorn atlas.api:app --host 127.0.0.1 --port 8000     # next to it, with Ollama
```

On Linux add `--add-host=host.docker.internal:host-gateway`, or use `--network host` with the default `ASK_API_URL`.
Put TLS in front (Caddy, Traefik or the host's load balancer).

## Machines without a GPU

The profile `auto` (config/models.yaml) switches to the CPU profile when no GPU is visible (or with `ATLAS_FORCE_CPU=1`).
Answers are built by code from the tool results, so the model only routes the question; it works on CPU, but the first
answer after a pause is slower while the model loads. Set `ATLAS_KEEP_ALIVE` to keep it in memory.

## What does not change between options

- The data is a snapshot: `data/atlas.duckdb` and `site/src/data/*.json` come from `./run_pipeline.sh`; the site has no live data source.
- No e-mail addresses are published (owner decision, 2026-10-29).
- Settings: `ATLAS_RATE_LIMIT_PER_MIN`, `ATLAS_MAX_CONCURRENCY`, `ATLAS_MAX_QUESTION_CHARS`, `ATLAS_OLLAMA_URL`, `ATLAS_PROFILE`.
