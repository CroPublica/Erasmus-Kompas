#!/usr/bin/env bash
# Run the whole KA2 Atlas demo on this machine: site + Ask API on one port.
#   ./demo.sh                  http://127.0.0.1:8080  (this machine only)
#   ./demo.sh --lan            listen on all interfaces so others on the network can open http://<this-pc>:8080
#   PORT=9000 ./demo.sh        another port
#   ./demo.sh --rebuild        export data and rebuild the site first (needs Node, see build_site.sh)
# Needs: ./setup.sh and ./run_pipeline.sh done. Ask needs Ollama running with the models of the active profile
# (the site works without it; the Ask page then shows its error message). Stop with Ctrl+C.
set -euo pipefail
cd "$(dirname "$0")"
HOST=127.0.0.1; REBUILD=0
for a in "$@"; do case "$a" in --lan) HOST=0.0.0.0 ;; --rebuild) REBUILD=1 ;; -h|--help) sed -n '2,8p' "$0"; exit 0 ;; *) echo "unknown option $a"; exit 2 ;; esac; done
export PATH="$HOME/.local/opt/node/bin:$PATH"
[ -x .venv/bin/python ] || { echo "No .venv yet: run ./setup.sh first"; exit 1; }
[ -f data/atlas.duckdb ] || { echo "data/atlas.duckdb not found: run ./run_pipeline.sh first"; exit 1; }
if [ "$REBUILD" = 1 ] || [ ! -f site/dist/index.html ]; then ./build_site.sh; fi
if ! curl -fs --max-time 3 "${ATLAS_OLLAMA_URL:-http://127.0.0.1:11434}/api/tags" >/dev/null; then
  echo "Note: Ollama is not answering; the site will work but the Ask page will not. Start it with: ollama serve"
fi
echo "KA2 Atlas demo: http://$([ "$HOST" = 0.0.0.0 ] && hostname -I | awk '{print $1}' || echo 127.0.0.1):${PORT:-8080}   (Ctrl+C to stop)"
exec .venv/bin/python tools/demo_server.py --host "$HOST" --port "${PORT:-8080}"
