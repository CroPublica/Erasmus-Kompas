# KA2 Atlas (app)

Public website on Croatian participation in Erasmus+ KA2 partnerships, 2014–2026.

- `LOG.md` — what has been done, results, mistakes, open problems (start here)
- `IMPLEMENTATION_PLAN.md` — what to build, in which order, and what exists already
- `BUILD_PLAN.md` — the specification (add it here)
- `design/screenshots/` — reference screens (01 organisation, 02 explorer, 03 coverage map, 04 county page)

Status: environment, model config and Phase 0 steps 00, 05, 07, 10, 30, 40 and 99 (raw data → staging, Croatian appearances, places, organisations, crosswalks, final tables, checks) are in place. See the plan for what comes next.

## Setup

```
cd app
./setup.sh                  # create .venv, install requirements, run tests, check Ollama
source .venv/bin/activate
```

Options: `--pull-models` (download the Ollama models used by the default profile), `--hf` (optional Hugging Face extras,
needs a CUDA GPU), `--recreate` (rebuild `.venv` from scratch). The script uses `uv` if installed, otherwise `venv` + `pip`,
and needs Python 3.11 or 3.12. It can be run again at any time.

Models are chosen in `config/models.yaml` (profiles `light`, `cpu`, `gemma8b`, `hosted`); switch per run with
`ATLAS_PROFILE=cpu`. Node.js is not needed until the website (Phase 1).

## Raw data

The pipeline reads raw files that are **not in git** (too large). Put them in one folder and either keep it at
`<repo parent>/data` (the default: two levels above `app/`) or pass `--raw-dir /path` / set `ATLAS_RAW_DIR`.
File names are matched by pattern, so the export date in a name may differ.

| Folder | File (pattern) | Source |
|---|---|---|
| `2014-2020/` | `ErasmusPlus_KA2_2014-2020_*Projects_Overview*.csv` | Erasmus+ Project Results Platform, KA2 export |
| `2014-2020/` | `tablica_1_*csv.csv`, `tablica_2_*csv.csv`, `tablica_3_*.csv`, `tablica_4_*.csv`, `tablica_5_*.csv` | data.gov.hr, "Program Erasmus+ za razdoblje od 2014. do 2020." (`2014-2020/download_erasmus_2014_2020.sh` downloads it) |
| root | `ErasmusPlus_KA2_2021-2027_*Projects_Overview*.csv` | Erasmus+ Project Results Platform, KA2 export |
| root | `tablica_7_*.csv`, `tablica_8_*.csv`, `tablica_9_*.csv` | data.gov.hr, Erasmus+ 2021–2027 |
| root | `Dječji vrtići.csv`, `Osnovne škole.csv`, `Srednje škole.csv`, `Ustanove iz sustava visokog obrazovanja.csv` | data.gov.hr, registers of educational institutions |

Registers are loaded **without** principals' names, phone numbers, faxes or e-mail addresses (plan §4.12).

## Run the pipeline

```
cd app
./setup.sh                      # once: environment
./run_pipeline.sh               # all steps, then the checks
```

Useful variants: `--raw-dir /path/to/data`, `--only 00` (one step), `--from 10` (that step and later), `--check`
(only the checks), `--llm` (also run the LLM steps 50+, which are skipped by default), `--strict` (checks that are not built yet count as failures). `./run_pipeline.sh --help` lists them.
Output: `data/atlas.duckdb` (rebuilt each time, not committed). Human review decisions go in `data/review/` (committed).

| Step | File | What it does | State |
|---|---|---|---|
| 00 | `pipeline/00_load_raw.py` | raw files → `stg_*` tables in DuckDB, all text, nothing cleaned | done (about 7 s) |
| 05 | `pipeline/05_hr_appearances.py` | one row per Croatian organisation in a KA2 project (4,389), unpivoted from the 100 partner slots | done |
| 07 | `pipeline/07_places.py` | postcode → town and county by majority vote; stored overrides in `data/review/place_overrides.csv` | done |
| 10 | `pipeline/10_orgs_resolve.py` | resolves Croatian organisations (anchors: tablica 4 OIDs and registries; fuzzy within a postcode; stored aliases and decisions in `data/review/`); builds `organisation`, `participation`, `institution`; writes `data/review_queue.csv` | done |
| 30 | `pipeline/30_crosswalks.py` | topic map 2014–2020 → 2021–2027 (`data/review/topic_crosswalk.csv`, proposed, not reviewed), organisation classes, action families | done |
| 40 | `pipeline/40_build_tables.py` | `project`, `project_topic`, and the views `v_org_ka2`, `v_county_ka2`, `v_coverage`, `v_hr_participation` | done |
| 50 | `pipeline/50_extract_concepts.py` | LLM extraction of problems, target groups, approaches, outputs with evidence quotes; cache in `data/extraction_cache.jsonl`; `--limit N` for tests | written, tested on 6 projects; full run pending |
| — | `eval/gold/` | gold-set batches of proposed extractions for human review (`make_batch.py`, `read_gold.py`, `batch_01.md`); scores step 50 | batch 1 under review |
| 51 | canonicalisation | merge near-duplicates, Croatian labels | not started |
| 60, 70 | graph analysis, site export | communities, static JSON per page | not started |
| 99 | `pipeline/99_validate.py` | regression checks from the plan | done (7 checks) |

Checks today (`./run_pipeline.sh --check`): 1, 2, 3, 5 and 7 pass. **4** fails by one project (151 projects involve
Dubrovačko-neretvanska, 150 wanted; everything else about it matches). **6** fails: tablica 1 projects placed by postcode
match tablica 5 within 3 in 19 of 21 counties, Zagrebačka is 16 short and Brodsko-posavska 6 short (the list has 2,058
projects, tablica 5 counts 2,111; no county is over, so rows are missing, not misplaced). Details and history in `LOG.md`.

### Known gaps in the raw files

- `tablica_7` CSV has call years 2024–2026 only (1,856 rows); the `.xlsx` has 2021–2026. The plan's check 5 uses the 2024–2026 rows.
- `tablica_1` CSV has 3 fewer rows for 2016 than the `.xlsx` the EDA parsed (2,058 vs 2,061).
- National project IDs sometimes carry trailing spaces or lack a hyphen (e.g. `2024-2-HR01-KA210-ADU000280988`); steps normalise them.
- The KA2 CSVs have 621 columns (up to 100 partners per project); the `.xls` used in the EDA stopped at 38 partners. For Croatian appearances this makes no difference (none sit in slots above 38).

## Website (Phase 1, started)

```
export PATH=~/.local/opt/node/bin:$PATH      # Node >= 22.23.4 (see LOG.md)
.venv/bin/python pipeline/70_export_site.py  # DuckDB -> site/src/data/*.json
cd site && npm install && npm run build      # static site in site/dist (npm run dev for development)
```

### Build and deploy the site

```
./build_site.sh                    # export data from DuckDB, build site/dist (static files, no server needed)
./build_site.sh --test             # ... and run the 21 browser tests
SITE_BASE=/atlas ./build_site.sh   # site served under a sub-path (also SITE_URL=https://example.org for canonical links)
./build_site.sh --docker           # ... and build a container image (deploy/Dockerfile: nginx, port 8080, security headers)
docker run --rm -p 8080:8080 ka2-atlas
```

`site/dist` is plain HTML, CSS and JSON, so any static host works (nginx, GitHub Pages, Netlify, an object-storage bucket):
upload the folder and serve `404.html` for missing pages. The exported data contains no e-mail addresses (owner decision,
2026-10-29). The Ask page, when built, needs a small API next to the static files; the static part does not depend on it.
`deploy/nginx.conf` sets caching (hashed assets for a year, pages revalidated) and a strict content-security policy.
Needs Node >= 22.23.4 (the script checks). The browser tests also need `cd site && npx playwright install chromium` once.

### Ask (question answering), first version

```
.venv/bin/python -m pytest -q                       # includes the tool, flow and API tests (no model server needed)
.venv/bin/python eval/run_ask.py                    # score eval/qa_hr.jsonl (template answers; router from the active profile)
.venv/bin/python eval/run_ask.py --mode llm         # let the answer model phrase the answers (the verifier checks them)
ATLAS_PROFILE=gemma8b .venv/bin/python eval/run_ask.py --mode llm --profile gemma8b
.venv/bin/uvicorn atlas.api:app --host 127.0.0.1 --port 8000     # POST /ask {"question": "..."}
```

Files: `atlas/tools.py` (nine read-only tools), `atlas/ask.py` (LangGraph flow: language, route, tools, answer, verify),
`atlas/api.py` (FastAPI: size cap, rate limit, concurrency limit), `eval/run_ask.py` (scoring; results in `eval/results/`).
Answers are built by code from the tool results by default (`ATLAS_ANSWER_MODE=template`); `llm` lets the model phrase them
with a verifier and a template fallback. Questions about problems, solutions and themes are answered with "not available yet"
until the concept layer exists. Needs Ollama running on 127.0.0.1 with the models of the active profile.
