#!/usr/bin/env bash
# Start, restart or stop the public demo on this PC (site container with password + Ask API). The tunnel is separate (cloudflared).
#   deploy/public_demo.sh start      start the API and the site container (needs deploy/htpasswd: deploy/make_password.sh <user> [password])
#   deploy/public_demo.sh restart    after a change: rebuild the site image from the current data/code, restart the container and the API
#   deploy/public_demo.sh tunnel     start the Cloudflare quick tunnel in the background and print its https address
#   deploy/public_demo.sh untunnel   close the tunnel (the address stops working)
#   deploy/public_demo.sh stop       stop both (the tunnel then shows an error page; close it with Ctrl+C in its terminal)
#   deploy/public_demo.sh status     (exit code 0 only when site, API and tunnel are all running: usable from cron)
#   deploy/public_demo.sh url        the current https address of the tunnel (from the log of the systemd service, see deploy/install_services.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/opt/node/bin:$PATH"
NAME=ka2-atlas
api_stop()  { pkill -f "[u]vicorn atlas.api" || true; }
api_start() { ATLAS_TRUST_PROXY=1 nohup .venv/bin/uvicorn atlas.api:app --host 127.0.0.1 --port 8000 >> data/api.log 2>&1 & }
site_stop() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
site_start() {
  [ -f deploy/htpasswd ] || { echo "deploy/htpasswd missing: run deploy/make_password.sh <user> first"; exit 1; }
  docker run -d --restart unless-stopped --name "$NAME" --network host -e ASK_AUTH='"Erasmus+ Kompas demo"' \
    -v "$PWD/deploy/htpasswd:/etc/nginx/htpasswd:ro" ka2-atlas >/dev/null
}
case "${1:-}" in
  start)   api_stop; api_start; site_stop; site_start ;;
  restart) ./build_site.sh --docker; api_stop; api_start; site_stop; site_start ;;
  stop)    site_stop; api_stop ;;
  tunnel)  pgrep -x cloudflared >/dev/null && { echo "tunnel already running:"; "$0" url; exit 0; }
           command -v cloudflared >/dev/null || { echo "cloudflared not found (see HOSTING.md)"; exit 1; }
           : > data/tunnel.log; nohup cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8080 >> data/tunnel.log 2>&1 &
           for _ in $(seq 1 30); do u=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' data/tunnel.log | head -1); [ -n "$u" ] && break; sleep 1; done
           [ -n "$u" ] && echo "tunnel address: $u   (user and password as set with deploy/make_password.sh)" || { echo "no address yet: see data/tunnel.log"; exit 1; }
           exit 0 ;;
  untunnel) pkill -x cloudflared && echo "tunnel closed" || echo "no tunnel was running"; exit 0 ;;
  status)  bad=0
           up=$(docker ps --filter "name=$NAME" --format "{{.Status}}"); [ -n "$up" ] && echo "site: $up" || { echo "site: stopped"; bad=1; }
           pgrep -f "[u]vicorn atlas.api" >/dev/null && echo "api: running" || { echo "api: stopped"; bad=1; }
           pgrep -x cloudflared >/dev/null && echo "tunnel: running" || { echo "tunnel: not running"; bad=1; }
           exit $bad ;;
  url)     u=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' data/tunnel.log 2>/dev/null | tail -1)
           [ -n "$u" ] || u=$(journalctl --user -u ka2-tunnel --no-pager 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
           [ -n "$u" ] && echo "$u" || echo "no address found (start the tunnel by hand: cloudflared tunnel --url http://127.0.0.1:8080)"; exit 0 ;;
  *) sed -n 2,7p "$0"; exit 2 ;;
esac
sleep 3; "$0" status || true
