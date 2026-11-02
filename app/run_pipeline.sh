#!/usr/bin/env bash
# Rebuild the KA2 Atlas database from the raw files. Safe to run again.
#
#   ./run_pipeline.sh                         run every step in pipeline/ in order, then the checks
#   ./run_pipeline.sh --raw-dir /path/to/data raw files are somewhere else (same as ATLAS_RAW_DIR)
#   ./run_pipeline.sh --only 00               run just one step (by its number), no checks
#   ./run_pipeline.sh --from 10               run steps 20 and later, then the checks
#   ./run_pipeline.sh --strict                checks that are "NOT BUILT" yet count as failures
#   ./run_pipeline.sh --llm                   also run the LLM steps 50, 51, 52 and 61 (hours, needs Ollama); steps 60 and 70 run when the concept tables exist
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
    # LLM steps (50 extraction, 51 canonicalisation, 52 Croatian names) take hours and need the model server: only with --llm or --only NN
    [ -z "$ONLY" ] && [ "$LLM" = 0 ] && { [ "$n" = 50 ] || [ "$n" = 51 ] || [ "$n" = 52 ]; } && { echo "skipping step $n (LLM; add --llm)"; continue; }
    # the graph needs the concept tables from step 51; without them skip it (the tables survive a rebuild from step 10, but not from step 00)
    if [ -z "$ONLY" ] && [ "$n" = 60 ] && ! $PY -c "import duckdb,sys; c=duckdb.connect('data/atlas.duckdb',read_only=True); sys.exit(0 if c.execute(\"select count(*) from information_schema.tables where table_name='concept_theme'\").fetchone()[0] else 1)" 2>/dev/null; then
      echo "skipping step 60 (no concept tables yet: run steps 50 and 51 with --llm)"; continue
    fi
    # step 61 drafts group names with the model (--llm or --only 61); otherwise it only loads the reviewed names that are already in data/review
    if [ -z "$ONLY" ] && [ "$n" = 61 ] && [ "$LLM" = 0 ]; then
      [ -f data/review/community_names.csv ] && { printf '\n=== step 61 (load names)\n'; $PY "$f" --load-only; } || echo "skipping step 61 (no names yet: run with --llm)"
      continue
    fi
    [ -n "$FROM" ] && [ "$n" -lt "$FROM" ] && continue
    printf '\n=== step %s: %s\n' "$n" "$(basename "$f")"
    $PY "$f"
  done
fi

if [ -z "$ONLY" ]; then
  printf '\n=== checks\n'
  $PY pipeline/99_validate.py $STRICT
fi
