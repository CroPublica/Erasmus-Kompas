# Hosting Erasmus+ Kompas

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
No TLS, password, security headers or caching: fine for a demo, do not expose it to the internet. For a public address see "Going public" below.

## 2. Static host for the site + the API on one small server

- Build: `SITE_URL=https://your.domain ./build_site.sh` (add `SITE_BASE=/atlas` if served under a sub-path).
  `build_site.sh` also runs `site/tools/ek/build_ek.py` (the v8 views and about 34 MB of per-project JSON, generated and not committed); a plain `docker build` from a fresh checkout needs that step first.
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

## Going public from this PC: Cloudflare Tunnel + password

A tunnel makes the container on this PC reachable at an https address without opening any router port or revealing your home IP.
You need a free Cloudflare account. A domain on Cloudflare gives you a stable address (`atlas.your-domain.org`); without a domain
a "quick tunnel" gives a random `https://….trycloudflare.com` address that changes every time, which is enough for a short demo.

**1. Start the Ask API and Ollama on this PC (private, localhost only)**
```
ollama serve &                                    # if not already running
ATLAS_TRUST_PROXY=1 .venv/bin/uvicorn atlas.api:app --host 127.0.0.1 --port 8000 &
```
`ATLAS_TRUST_PROXY=1` makes the rate limit count each visitor separately instead of counting the proxy as one visitor.

**2. Create the site password and start the container**
```
deploy/make_password.sh demo            # prints the generated password (or: deploy/make_password.sh demo 'your-password')
./build_site.sh --docker
docker run -d --restart unless-stopped --name ka2-atlas --network host \
  -e ASK_AUTH='"Erasmus+ Kompas demo"' -v "$PWD/deploy/htpasswd:/etc/nginx/htpasswd:ro" ka2-atlas
```
The site is now at `http://127.0.0.1:8080` and asks for the user name and password (the whole site and `/api/`).
`--network host` lets the container reach the API on 127.0.0.1:8000 without further settings. Test: opening it without the password gives 401.

**3a. Quick tunnel (no domain, temporary address)**
```
cloudflared tunnel --url http://127.0.0.1:8080
```
It prints the `https://….trycloudflare.com` address. Send it together with the user name and password. Ctrl+C closes it.
Install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ (Debian/Ubuntu: the .deb package).

**3b. Named tunnel (own domain, stable address)**
```
cloudflared tunnel login                                  # opens the browser; pick the domain
cloudflared tunnel create ka2-atlas
cloudflared tunnel route dns ka2-atlas atlas.your-domain.org
cat > ~/.cloudflared/config.yml <<EOF
tunnel: ka2-atlas
credentials-file: /home/<you>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: atlas.your-domain.org
    service: http://127.0.0.1:8080
  - service: http_status:404
EOF
sudo cloudflared service install                          # starts at boot
```

**4. Optional, in the Cloudflare dashboard (free plan)**
- *Security → WAF → Rate limiting rules*: for example 60 requests per minute per IP on `/api/*`. This protects the one model on this PC.
- *Zero Trust → Access → Applications*: instead of (or besides) the password, allow only listed e-mail addresses (one-time code by e-mail).
- *SSL/TLS → Edge Certificates*: turn on "Always use HTTPS". The site already sends the HSTS header.

**What protects what**: the tunnel gives https; the password keeps strangers out; nginx adds security headers and the 4 KB request limit;
the API limits size, rate per visitor and concurrency; Ollama and the API listen on 127.0.0.1 only, so they cannot be reached directly.
To stop sharing: Ctrl+C the quick tunnel, or `docker rm -f ka2-atlas`. Change the password by running `deploy/make_password.sh` again and restarting the container.
The password is a shared one; it keeps casual visitors out but is not a user system. Do not reuse a password you use elsewhere.

## Start by itself after a reboot

The site container restarts with Docker (`--restart unless-stopped`). For the API and the tunnel:

```
deploy/install_services.sh            # systemd user services ka2-api and ka2-tunnel (no root); --remove undoes it
sudo loginctl enable-linger $USER     # once: start them at boot without logging in
deploy/public_demo.sh status          # exit code 0 only when site, API and tunnel all run (usable from cron)
deploy/public_demo.sh url             # the tunnel's current https address (a quick tunnel gets a new one at each start)
```

Stop a tunnel started by hand before installing, or you will have two. With a named tunnel (own domain) the address does not change.
