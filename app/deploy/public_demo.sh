#!/usr/bin/env bash
# Start, restart or stop the public demo on this PC (site container with password + Ask API). The tunnel is separate (cloudflared).
#   deploy/public_demo.sh start      start the API and the site container (needs deploy/htpasswd: deploy/make_password.sh <user> [password])
#   deploy/public_demo.sh restart    after a change: rebuild the site image from the current data/code, restart the container and the API
#   deploy/public_demo.sh stop       stop both (the tunnel then shows an error page; close it with Ctrl+C in its terminal)
#   deploy/public_demo.sh status
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/opt/node/bin:$PATH"
NAME=ka2-atlas
api_stop()  { pkill -f "uvicorn atlas.api" || true; }
api_start() { ATLAS_TRUST_PROXY=1 nohup .venv/bin/uvicorn atlas.api:app --host 127.0.0.1 --port 8000 >> data/api.log 2>&1 & }
site_stop() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
site_start() {
  [ -f deploy/htpasswd ] || { echo "deploy/htpasswd missing: run deploy/make_password.sh <user> first"; exit 1; }
  docker run -d --restart unless-stopped --name "$NAME" --network host -e ASK_AUTH='"KA2 Atlas demo"' \
    -v "$PWD/deploy/htpasswd:/etc/nginx/htpasswd:ro" ka2-atlas >/dev/null
}
case "${1:-}" in
  start)   api_stop; api_start; site_stop; site_start ;;
  restart) ./build_site.sh --docker; api_stop; api_start; site_stop; site_start ;;
  stop)    site_stop; api_stop ;;
  status)  docker ps --filter "name=$NAME" --format "site: {{.Status}}"; pgrep -f "uvicorn atlas.api" >/dev/null && echo "api: running" || echo "api: stopped"
           pgrep -f "cloudflared tunnel" >/dev/null && echo "tunnel: running" || echo "tunnel: not running"; exit 0 ;;
  *) sed -n 2,7p "$0"; exit 2 ;;
esac
sleep 3; "$0" status
