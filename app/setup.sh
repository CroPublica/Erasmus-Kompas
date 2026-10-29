#!/usr/bin/env bash
# One-step setup for KA2 Atlas (Python side). Safe to run again.
#
#   ./setup.sh                 create .venv, install requirements, run tests, check Ollama
#   ./setup.sh --hf            also install the optional Hugging Face extras (torch, transformers, bitsandbytes; needs a CUDA GPU)
#   ./setup.sh --pull-models   also `ollama pull` the models in config/models.yaml profile "light"
#   ./setup.sh --recreate      delete .venv first and rebuild it
#
# Afterwards:  source .venv/bin/activate

set -euo pipefail
cd "$(dirname "$0")"

WITH_HF=0; PULL=0; RECREATE=0
for arg in "$@"; do
  case "$arg" in
    --hf) WITH_HF=1 ;;
    --pull-models) PULL=1 ;;
    --recreate) RECREATE=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg (see --help)"; exit 2 ;;
  esac
done

say() { printf '\n== %s\n' "$*"; }

# ---- Python (3.11 or 3.12)
PY=""
for c in python3.12 python3.11 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if (3,11) <= sys.version_info[:2] < (3,13) else 1)'; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "Need Python 3.11 or 3.12 on PATH (found none). Install it, or install uv: https://docs.astral.sh/uv/"; exit 1; }

say "Environment (.venv)"
[ "$RECREATE" = 1 ] && rm -rf .venv
if command -v uv >/dev/null 2>&1; then
  TOOL="uv"
  [ -d .venv ] || uv venv .venv --python "$PY"
  INSTALL=(uv pip install --python .venv/bin/python)
else
  TOOL="pip"
  [ -d .venv ] || "$PY" -m venv .venv
  .venv/bin/python -m pip install --quiet --upgrade pip
  INSTALL=(.venv/bin/python -m pip install)
fi
echo "using $TOOL, $(.venv/bin/python --version)"

say "Installing requirements.txt"
"${INSTALL[@]}" -r requirements.txt
if [ "$WITH_HF" = 1 ]; then
  say "Installing requirements-hf.txt (optional)"
  "${INSTALL[@]}" -r requirements-hf.txt
fi

say "Tests"
.venv/bin/python -m pytest -q

say "Ollama (LLMs and embeddings run there)"
if command -v ollama >/dev/null 2>&1; then
  MODELS=$(.venv/bin/python - <<'EOF'
from atlas.config import load_profile
specs = load_profile("light")
print(" ".join(sorted({s.model for s in specs.values() if s.provider == "ollama"})))
EOF
)
  # Ollama should listen on loopback only (127.0.0.1), never on all interfaces.
  if command -v ss >/dev/null 2>&1; then
    BIND=$(ss -ltn 2>/dev/null | awk '$4 ~ /:11434$/ {print $4}' | head -1)
    case "$BIND" in
      "") echo "  Ollama server is not running (start it with: ollama serve)" ;;
      127.0.0.1:*|"[::1]:"*) echo "  Ollama listens on $BIND (loopback only: good)" ;;
      *) echo "  WARNING: Ollama listens on $BIND, reachable from the network. Set OLLAMA_HOST=127.0.0.1:11434 and restart it." ;;
    esac
  fi
  INSTALLED=$(ollama list 2>/dev/null | awk 'NR>1 {print $1}' || true)
  for m in $MODELS; do
    if echo "$INSTALLED" | grep -qx "$m"; then echo "  installed: $m"
    elif echo "$INSTALLED" | grep -qx "$m:latest"; then echo "  installed: $m:latest"
    elif [ "$PULL" = 1 ]; then echo "  pulling:   $m"; ollama pull "$m"
    else echo "  MISSING:   $m   ->  ollama pull $m   (or rerun with --pull-models)"; fi
  done
else
  echo "  ollama not found. Install it from https://ollama.com, then run ./setup.sh --pull-models"
fi

say "Node.js (only needed for the website, Phase 1)"
if command -v node >/dev/null 2>&1; then echo "  node $(node --version)"
else echo "  not installed yet; not needed until the site/ folder exists"; fi

say "Done. Activate with:  source .venv/bin/activate"
