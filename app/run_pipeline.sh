#!/usr/bin/env bash
# Rebuild the KA2 Atlas database from the raw files. Safe to run again.
#
#   ./run_pipeline.sh                         run every step in pipeline/ in order, then the checks
#   ./run_pipeline.sh --raw-dir /path/to/data raw files are somewhere else (same as ATLAS_RAW_DIR)
#   ./run_pipeline.sh --only 00               run just one step (by its number), no checks
#   ./run_pipeline.sh --from 10               run steps 20 and later, then the checks
#   ./run_pipeline.sh --strict                checks that are "NOT BUILT" yet count as failures
#   ./run_pipeline.sh --llm                   also run the LLM steps (50 and later; hours, needs Ollama)
#   ./run_pipeline.sh --check                 only run the checks (pipeline/99_validate.py)
#
# Steps are the numbered files in pipeline/ (00_load_raw.py, 05_..., 07_..., 10_...); 99_validate.py always runs last.
# Needs the environment from ./setup.sh (it is created automatically if .venv is missing).
# Output: data/atlas.duckdb (not committed). Raw files are never modified.

set -euo pipefail
cd "$(dirname "$0")"

ONLY=""; FROM=""; STRICT=""; CHECK_ONLY=0; LLM=0
while [ $# -gt 0 ]; do
  case "$1" in
    --raw-dir) export ATLAS_RAW_DIR="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    --from) FROM="$2"; shift 2 ;;
    --strict) STRICT="--strict"; shift ;;
    --check) CHECK_ONLY=1; shift ;;
    --llm) LLM=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)"; exit 2 ;;
  esac
done

[ -x .venv/bin/python ] || { echo "No .venv yet, running ./setup.sh first"; ./setup.sh; }
PY=.venv/bin/python

RAW=$($PY -c "import sys; sys.path.insert(0,'pipeline'); from common import RAW_DIR; print(RAW_DIR)")
if [ ! -d "$RAW" ]; then
  cat <<MSG
Raw data folder not found: $RAW
Put the raw files there, or point to them with  --raw-dir /path  (or the ATLAS_RAW_DIR variable).
Expected contents are listed in README.md ("Raw data").
MSG
  exit 1
fi
echo "raw data: $RAW"

if [ "$CHECK_ONLY" = 0 ]; then
  for f in $(ls pipeline/[0-9][0-9]_*.py | sort); do
    n=$(basename "$f" | cut -c1-2)
    [ "$n" = "99" ] && continue
    [ -n "$ONLY" ] && [ "$n" != "$ONLY" ] && continue
    # LLM steps take hours and need the GPU: only with --llm or --only NN
    [ -z "$ONLY" ] && [ "$LLM" = 0 ] && [ "$n" -ge 50 ] && [ "$n" -lt 99 ] && { echo "skipping step $n (LLM; add --llm)"; continue; }
    [ -n "$FROM" ] && [ "$n" -lt "$FROM" ] && continue
    printf '\n=== step %s: %s\n' "$n" "$(basename "$f")"
    $PY "$f"
  done
fi

if [ -z "$ONLY" ]; then
  printf '\n=== checks\n'
  $PY pipeline/99_validate.py $STRICT
fi
