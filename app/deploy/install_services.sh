#!/usr/bin/env bash
# Make the public demo start by itself (as your user, no root): the Ask API and the tunnel as systemd user services.
# The site container already restarts with Docker (--restart unless-stopped).
#   deploy/install_services.sh            install, enable and start ka2-api and ka2-tunnel
#   deploy/install_services.sh --remove   stop and remove them
# After a reboot they start when you log in; `sudo loginctl enable-linger $USER` (once) makes them start without logging in.
set -euo pipefail
cd "$(dirname "$0")/.."
APP="$PWD"; UNITS="$HOME/.config/systemd/user"
if [ "${1:-}" = "--remove" ]; then
  systemctl --user disable --now ka2-api ka2-tunnel 2>/dev/null || true
  rm -f "$UNITS/ka2-api.service" "$UNITS/ka2-tunnel.service"; systemctl --user daemon-reload; echo "removed"; exit 0
fi
CF="$(command -v cloudflared)" || { echo "cloudflared not found (see HOSTING.md)"; exit 1; }
[ -x .venv/bin/uvicorn ] || { echo ".venv missing: run ./setup.sh"; exit 1; }
mkdir -p "$UNITS"
for u in ka2-api ka2-tunnel; do sed -e "s#@APP@#$APP#g" -e "s#@CLOUDFLARED@#$CF#g" "deploy/systemd/$u.service" > "$UNITS/$u.service"; done
systemctl --user daemon-reload
pkill -f "[u]vicorn atlas.api" || true                    # a copy started by hand would hold port 8000
systemctl --user enable --now ka2-api ka2-tunnel
sleep 6; deploy/public_demo.sh url || true
