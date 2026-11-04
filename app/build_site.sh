#!/usr/bin/env bash
# Build the static website from the database: export data, then build site/dist. Safe to run again.
#   ./build_site.sh                       site at the root of a domain
#   SITE_BASE=/atlas ./build_site.sh      site under a sub-path
#   ./build_site.sh --test                also run the browser tests (needs Chromium: cd site && npx playwright install chromium)
#   ./build_site.sh --docker              also build the container image (deploy/Dockerfile)
# Needs: ./setup.sh done, ./run_pipeline.sh done (data/atlas.duckdb exists), Node >= 22.23.4 on PATH.
set -euo pipefail
cd "$(dirname "$0")"
TEST=0; DOCKER=0
for a in "$@"; do case "$a" in --test) TEST=1 ;; --docker) DOCKER=1 ;; -h|--help) sed -n '2,8p' "$0"; exit 0 ;; *) echo "unknown option $a"; exit 2 ;; esac; done

[ -f data/atlas.duckdb ] || { echo "data/atlas.duckdb not found: run ./run_pipeline.sh first"; exit 1; }
command -v node >/dev/null || { echo "Node.js not on PATH (need >= 22.23.4). See README, 'Website'."; exit 1; }
node -e 'const [a,b,c]=process.versions.node.split(".").map(Number); process.exit(a>22||(a==22&&(b>23||(b==23&&c>=4)))?0:1)' \
  || { echo "Node $(node --version) is too old for Astro 7 (need >= 22.23.4)"; exit 1; }

echo "== export site data"; .venv/bin/python pipeline/70_export_site.py
echo "== v8 views (bundle and data)"; python3 site/tools/ek/build_ek.py
echo "== build site"; (cd site && { [ -d node_modules ] || npm ci; } && npx astro build)
if [ "$TEST" = 1 ]; then echo "== browser tests"; (cd site && node tests/ui.mjs); fi
if [ "$DOCKER" = 1 ]; then echo "== container image"; docker build -f deploy/Dockerfile --build-arg SITE_BASE="${SITE_BASE:-/}" --build-arg SITE_URL="${SITE_URL:-}" -t ka2-atlas .; fi
echo "done: site/dist ($(find site/dist -name '*.html' | wc -l) pages)"
