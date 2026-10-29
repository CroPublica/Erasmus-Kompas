# KA2 Atlas — implementation plan

Turns `BUILD_PLAN.md` (the spec: questions, data rules, data model, GraphRAG design, design guidelines) into
concrete work in this repository. Section numbers like "§4" refer to that file. It is not yet in this folder:
put it in `app/` so the two stay together. Screenshots are in `design/screenshots/` (01 organisation, 02 explorer,
03 coverage map, 04 county page).

Nothing here is built yet. Estimates are relative sizes (S ≤ 2 days, M ≈ 1 week, L ≈ 2+ weeks) for one person.

---

## 1. Starting point: what exists vs what the plan needs

The EDA work in `EDA/` already covers part of Phase 0 and a rough version of Phase 2–3.

| Needed (BUILD_PLAN) | What exists | Gap |
|---|---|---|
| Croatian KA2 participation, both periods | `EDA/Data/processed/knowledge_graph.json`: **3,830 projects with a Croatian participant, 606 coordinated**. This matches the regression check in §4 exactly | none; use as a cross-check, not as the source |
| Raw sources | `../data/`: KA2 EU exports (2014–20, 2021–27), tablica 1–9 (4, 5, 6 only for 2014–20), school/kindergarten/higher-ed registries | tablica 4 (OIDs) exists only for 2014–20; 2021–27 organisations have no OID |
| Organisation resolution (§4.5–4.6) | exact name + postcode/place matching to registries (`EDA/Scripts/povezivanje.py`); 1,544 Croatian organisations left unmatched; no OIDs, no review queue, no similarity matching | **the biggest gap**: needs fuzzy matching (similarity ≥ 88 on name + postcode), OID anchoring, English aliases, review queue with stored decisions |
| County from postcode, majority vote (§4.3) | county only for registry-matched institutions | postcode → county table; vote across sources for the rest |
| Grants from the EU export only (§4.7) | graph carries national-list amounts on `RECEIVED_GRANT` and the EU grant as `ka2_total_grant_eur` | site must read only the EU-export grant |
| Key action from project code (§4.4) | done in the graph (`action_code`) | none |
| Coverage denominators (§4.11) | registers cleaned; 13 dual-listed schools deduplicated; 1,356 distinct schools (matches screen 03) | exclude short-programme providers from kindergartens |
| Organisational e-mails only (§4.12) | processed registry **drops all e-mail columns** on purpose | re-extract from raw with an organisational-address filter; keep personal-looking addresses out |
| Problem / approach / target-group / output extraction (§7) | rule-based (regex vocabularies) in `23_extract_summary_concepts.py`; est. precision ≈ 65% Problem, 85% TargetGroup, 83% Approach, 94% Output; English only; no evidence sentences; no planned/reported status | replace with schema-constrained LLM extraction + gold set; keep regex as baseline |
| Concept graph, PMI, communities (§7) | PMI co-occurrence, hub filter, 14 Louvain communities | Leiden (igraph), LLM community reports |
| Keyphrases | spaCy + TF-IDF `keyphrases`; Gemma-31B pass drafted (`27_keyphrases_gemma31b.py`) but **not yet verified**: the smoke test produced no output when last run | verify or drop; not on the critical path |
| Croatian labels for concepts and 76 topics (§8) | none; everything is English | one-time translation + human review |
| 59 → 76 topic crosswalk (Phase 0b) | none | build and review |
| Website, API, search, map, explorer, Ask | nothing | all of it |

Environment facts that affect choices:
- Installed: `langchain 1.4`, `langgraph`, `fastapi`, `networkx`, `pandas`, `spacy`, `transformers 5`, `bitsandbytes`.
- Not installed: `duckdb`, `igraph`/`leidenalg`, `langchain-ollama`, any vector store.
- `sentence-transformers` fails to import (torch 2.7.1 vs what it expects). Use embeddings through Ollama or ONNX instead of fixing torch.
- Local LLMs: Ollama `gemma4:latest` (8B, Q4_K_M) on an A100 40 GB; `google/gemma-4-31B-it` in the HF cache (59 GB bf16, so 4-bit only).

---

## 2. Architecture and stack

Follows §6, with choices made to keep hosting cheap.

```
../data (raw) ─► pipeline/ (Python) ─► app/data/atlas.duckdb + parquet
                     │                         │
                     │                         ├─► build step ─► static JSON per entity ─► site/ (Astro)
                     └─► LLM extraction ───────┤
                                               └─► api/ (FastAPI): search · path · neighbours · Ask (LangGraph)
```

| Layer | Choice | Why |
|---|---|---|
| Data store | DuckDB + Parquet | one file, SQL views from §5, no server |
| Graph compute | igraph (Leiden, betweenness, shortest path) | named in §6; add to env |
| Site | Astro (TypeScript), islands for Explorer / Ask / map | pre-built pages, little JS; `/hr/` and `/en/` routes |
| Charts | Observable Plot + hand-made SVG for the interval chart and dot timeline | the screens use small custom charts |
| Graph UI | Cytoscape.js (ego networks); Sigma.js only for the cluster overview | §6 |
| Entity search | client-side index (Pagefind or MiniSearch) for names, towns, topics | ~5k entities; no search server needed |
| Semantic search | multilingual embeddings (bge-m3 via Ollama) + brute-force cosine over numpy for ~50k vectors | no vector DB until it is needed |
| API | FastAPI | already installed |
| Q&A | LangGraph + langchain-core, Ollama chat model | see §5 |

Pages: HR-involved projects (3,830) are static. The other ~42,700 EU projects are loaded on demand from the API
(they are reachable by search and paths only, §6). Decision for you, see §8.

### Repository layout

```
app/
  BUILD_PLAN.md              the spec (to be added)
  IMPLEMENTATION_PLAN.md     this file
  design/                    screenshots, design tokens (colours, fonts from §8)
  pipeline/                  numbered steps, each rerunnable
      00_load_raw.py         raw CSV/XLS → staging parquet
      10_orgs_resolve.py     name+postcode matching, OIDs, aliases → review queue (needs 07)
      11_orgs_apply_review.py  re-applies stored human decisions
      07_places.py           postcode → county/town; majority vote (runs before 10)
      30_crosswalks.py       topic map 59→76, org type map, action levels
      40_build_duckdb.py     tables + views from §5
      50_extract_concepts.py LLM extraction (schema-constrained, evidence pointers)
      51_canonicalise.py     embed, cluster, label (HR + EN)
      60_graph.py            concept edges, PMI, Leiden, layouts, community reports
      70_export_site.py      static JSON per entity
      99_validate.py         regression checks from §4
  data/                      atlas.duckdb, parquet, review decisions (committed, small)
  site/                      Astro project
  api/                       FastAPI + LangGraph agent
  eval/                      gold annotations, Croatian question set, scripts
```

Reuse from `EDA/`: name normalisation and tier logic (`povezivanje.py`), the Gemma evaluation harness
(`25_eval_extraction_gemma.py`), the regex extractor as a baseline for comparing the LLM extractor.

---

## 3. Build phases

Same phases as §9, with the concrete tasks, the check that closes each, and the size.

### Phase 0 — Backbone (L)
1. Load all raw KA2 rows (both periods, all countries), the registries and tablica 1–9 into staging parquet. **S**
2. Place table: postcode → county/town; majority vote across KA2 address, NA lists, registry; keep conflicts. **M**
3. Organisation resolution (the long pole). **L**
   - Candidates from name similarity (≥ 88) within the same postcode, plus exact-name matches elsewhere flagged for review.
   - Anchor identity in order: OID (2014–20) → registry key → hash of name + postcode (§4.6).
   - University vs faculty: never auto-merge higher-education units (§10).
   - Review queue as a CSV/small UI; decisions stored under `data/review/` and re-applied on every rebuild.
   - English alias list (e.g. "University of Rijeka" ↔ "Sveučilište u Rijeci").
4. Organisational e-mails from raw registries with a filter (ured@, tajnistvo@, info@ …); anything that looks personal is dropped. **S**
5. Build DuckDB tables and the four views in §5. **M**
6. `99_validate.py`: the six regression checks in §4. **S**

**Done when** all six checks pass and the review queue is empty or consciously deferred.
Known targets: 3,830 / 606; Gimnazija Metković 22 and 1; Sveučilište u Dubrovniku 34; Dubrovačko-neretvanska 150 / 17 / €3.72M.

### Phase 0b — Crosswalks (S–M)
Topic map 59 → 76 (needs a human-reviewed table), EU organisation type ↔ registry kind, action levels.
Croatian labels for the 76 topics and for action types. **Done when** every project has ≥ 1 current-vocabulary topic.

### Phase 1 — Registry site (L), ships on its own
1. Design tokens and base components from the screens. **S**
2. Entity pages: organisation (screen 01), place/county (04), country, project. **L**
3. Entity search with HR/EN toggle and Croatian number formatting. **M**
4. Coverage map (03): tile map, Wilson 95% intervals, expected-vs-actual by indirect standardisation. **M**
5. Provenance footer on every figure; "2026 partial" markers. **S**

**Done when** Q1, 2, 4, 5, 11, 12 are answerable in ≤ 3 clicks, and an accessibility pass is clean
(keyboard, screen reader, 4.5:1 contrast, phone width).

Components seen in the screens: header + language toggle, KPI tile, the three named money measures, stacked bars per
call year, coverage gauge, filterable organisation table, by-town bars, country and topic chips, project cards,
participation dot timeline, tile map, interval ranking, "selected county" panel, similar-organisations cards.

### Phase 2 — Extraction (L)
1. Gold set: hand-annotate 50–100 summaries per period (§7), using the evaluation harness as the scorer. **M**
2. LLM extractor: JSON-schema output with `evidence` (section + sentence) and `status` (planned/reported); acronym expansion in the prompt. **M**
   - Develop on Ollama `gemma4:latest`; run the production build with `gemma-4-31B-it` (4-bit) if the gold set shows a real gain.
   - 3,830 summaries: roughly 2 s each on the 8B model per call; budget several hours for 31B.
3. Canonicalisation: embed phrases (bge-m3), cluster, label each cluster in English + Croatian, keep aliases, attach to topics. **M**
4. Measure precision/recall per period; compare with the regex baseline; version prompt + schema on every extracted node. **S**

**Done when** precision is acceptable in both periods against the gold set (threshold agreed with you before the run).

### Phase 3 — Graph and explorer (L)
Aggregated edges (`ADDRESSED_BY`, PMI), Leiden communities + LLM community reports, precomputed layouts, explorer UI
(three panes, four lenses, filters, undo, list view for phones), path finder excluding hubs. **Done when** Q6–9 work.
The hub filter and PMI logic from `24_concept_graph_analysis.py` carry over.

### Phase 4 — Ask (M–L), design in §5
### Phase 5 — First project (M)
Ladder analysis: first KA2 action per organisation, next steps, success rates from tablica 9 (2021–26, national only, §4.10).

---

## 4. Data and quality safeguards

- Every rule in §4 becomes a check in `99_validate.py` that fails the build. Add: no personal names in any output, no KA1-based participation, no county sums presented as national totals.
- Money: three named measures only. Never add "value of projects involved in" across places.
- Provenance: each exported figure carries source, date and method note.
- Review decisions are data, committed to the repository, never edited in place by scripts.
- Extracted concepts carry `extractor_version`; a rebuild never silently mixes versions.

---

## 5. Question answering over the knowledge graph

**Goal:** answer questions in Croatian or English ("Koji projekti rješavaju nedostatak digitalnih vještina u Slavoniji?",
"Which schools in Istria have coordinated a partnership?") with every claim cited to projects, and say "no evidence found" when that is true.

### Design principle
A small model cannot be trusted to write SQL or Cypher, or to do arithmetic. So the model never queries freely:
- **Numbers and lists come from deterministic tools** over DuckDB and the graph.
- **The model only does three things:** classify the question, pick tool arguments, and phrase the answer from the tool results.
- **A verifier** checks the answer against the tool results before it is shown.

### Flow (LangGraph)
```
question ─► detect language ─► route (structured output)
              ├─ lookup     ─► org/place tools ──────────────┐
              ├─ statistics ─► coverage/county/country tools ─┤
              ├─ local      ─► concept search + neighbourhood ─┼─► compose answer (HR/EN) ─► verify ─► reply
              ├─ global     ─► community reports (map-reduce) ─┤        │                     │
              ├─ path       ─► shortest-path tool ─────────────┘        └─ no evidence ─────► refusal
              └─ out of scope ─► polite refusal
```

### Tools (read-only, return rows with project IDs)
`find_organisation`, `organisation_profile`, `county_stats`, `coverage(county, institution_type, period)`,
`search_concepts` (embedding match, Croatian or English), `solutions_for_problem(problem, scope=HR|EU)`,
`neighbours(concept)`, `shortest_path(a, b)`, `community_summary`, `search_projects(text, filters)` (hybrid keyword + embedding).

### Language handling
- Retrieval is multilingual: bge-m3 embeds Croatian queries against English summaries and concepts directly.
- Concept and topic labels are stored in both languages (§8), so answers can use official-sounding Croatian terms.
- Answer language follows the question language. Project titles and summaries stay in their original language.

### Model choice
"Lightweight" means: runs quantised on one modest GPU, or slowly on CPU. Candidates:

| Model | Notes |
|---|---|
| `gemma4:latest` (8B, Q4) | already installed; tested here for English concept judgement (it followed a by-name prompt well enough to use as a reviewer). **Croatian quality not yet measured** |
| Gemma 3 4B / 1B | smaller fallback from the same family |
| Qwen2.5 7B / 3B, Llama 3.x 8B, Mistral Nemo 12B | general multilingual; Croatian quality varies |
| GaMS (Slovenian-led South Slavic model that includes Croatian) | worth testing; check current availability and licence before relying on it |

**CPU-only hosting.** A `cpu` profile exists in `config/models.yaml`: `qwen2.5:3b-instruct-q4_K_M` for every chat role and `bge-m3` for
embeddings, with `runtime.max_concurrency: 2` (env `ATLAS_MAX_CONCURRENCY`) so parallel requests do not starve the CPU.
Rough memory needs for a 3B Q4 model are 8 GB RAM minimum, 16 GB comfortable. Two things to know:
- Qwen 2.5's officially listed languages do not include Croatian, so "handles Croatian natively" is unverified. The bake-off decides.
- `nomic-embed-text` is English-focused, so it is not used for Croatian queries; `bge-m3` is.

On CPU, keep prompts short, cap `num_ctx`, and put a fixed language rule at the top and bottom of every Ask prompt
(for example: "Odgovori isključivo na hrvatskom jeziku; koristi samo podatke iz alata; ako nema dokaza, reci to."). Because the
tools do the data work, the 3B model only classifies and phrases, which is what makes this size plausible.
This plan does not use Microsoft GraphRAG, so its `settings.yaml` options (chunk size, async mode) do not apply here.

**Do not pick on reputation.** Run a bake-off on a 60-question Croatian set (below) and take the smallest model that passes.
Keep the model behind a one-line config (`ChatOllama(model=…)`) so it can be swapped, including for a hosted API if you decide to allow that.

### Evaluation (build before the model choice)
`eval/qa_hr.jsonl` (78 questions, started) with expected tool, expected facts and expected citations, in four groups:
lookups, statistics (answers verifiable against the regression checks), concept/problem→solution questions, and
unanswerable or out-of-scope questions. Scores: right route, valid citations (every cited ID is in the tool output),
numeric faithfulness, correct refusal, answer in the right language. Run on every change to the prompt, tools or model.

### Safety
- Summaries are untrusted text. They go into prompts only as quoted data; tools are read-only; no tool accepts free-form SQL.
- No personal names: tools never return them because the data never contains them.
- Rate limiting and a request size cap on the public endpoint.

### Phase 4 tasks
1. `api/tools.py` with tests against the regression numbers. **M**
2. Router with structured output; LangGraph flow; verifier. **M**
3. Run the model bake-off on `eval/qa_hr.jsonl` (CPU and GPU, see §5b); choose the model. **M**
4. Ask page: streaming answer, citation chips linking to project pages, "show how I got this" panel listing the tools called. **M**

**Done when** every answer cites projects, the reference set passes, and unanswerable questions are refused.
Decision needed on how the model is served publicly (§8).

---

## 5b. Testing: CPU-only vs GPU, and model comparison

Question set: `eval/qa_hr.jsonl` (78 questions, grading rules in `eval/README.md`). Run it for every combination below.

### What is compared

| Axis | Values |
|---|---|
| Hardware | **CPU-only** (no GPU visible) · **GPU** (the A100) |
| Model (`ask_router` + `ask_answer`) | `qwen2.5:3b-instruct` · `qwen2.5:7b-instruct` · `gemma4:latest` (8B) · `llama3.2:3b-instruct` · `gemma3:4b` · GaMS, if available; optional hosted model as an upper bound |
| Embeddings | `bge-m3` for all runs (so retrieval is the same); `nomic-embed-text` as a single negative control for Croatian |
| Concurrency | 1, 2, 4 simultaneous questions (only 1 and 2 on CPU) |

### How to run each side

- **GPU:** start Ollama normally and run with the profile under test (`ATLAS_PROFILE=light|gemma8b|...`).
- **CPU-only:** start a second Ollama server that cannot see the GPU and point the app at it:
  `CUDA_VISIBLE_DEVICES=-1 OLLAMA_HOST=127.0.0.1:11435 ollama serve` then `ATLAS_OLLAMA_URL=http://127.0.0.1:11435 ATLAS_PROFILE=cpu ...`.
  Record the CPU model, core count and RAM with the results, because CPU numbers do not transfer between machines.
- Keep `temperature` as configured (0 for the router), identical prompts and the same data build for every run.

### Two kinds of tests, kept separate

1. **Replay mode (quality):** record each question's tool outputs once, then feed the same tool outputs to every model.
   This isolates what the model does (routing, wording, citing, refusing) from retrieval, and makes quality results
   independent of hardware. A model is never penalised for a slow machine here.
2. **Live mode (speed and resources):** the full path, with real tools, to measure what a visitor would wait for.

### Metrics

| Group | Metric | Notes |
|---|---|---|
| Quality | route accuracy · tool-choice accuracy · fact match · citation validity · language correctness · refusal accuracy | the grading list in `eval/README.md` |
| Format | share of router outputs that are valid JSON on the first try; retries needed | small models fail here first |
| Faithfulness | answers containing a number not in the tool output | target: zero |
| Speed | time to first token, total time, tokens/s (p50 and p95), per question group | CPU: also time under concurrency 2 |
| Resources | peak RAM (CPU runs), peak VRAM (GPU runs), model load time | |
| Stability | same question run 3 times at temperature 0.2: answer variation | answer model only |

### Acceptance (proposed, adjust after the first run)

- Router JSON valid ≥ 98% after one retry; route accuracy ≥ 90%.
- Zero invented citations; zero numbers absent from tool output.
- Refusal accuracy ≥ 95% on `limits` and injection questions (no leaks, no invented answers).
- Croatian answers: language correct ≥ 95%; grammar checked by a human on a sample of 20 answers.
- Speed: first token under ~3 s on the target hosting; full answer under ~20 s for lookups and statistics. These are
  guesses to tune against what users tolerate; report the measured values either way.
- Choose the **smallest model that passes**. If only the larger models pass quality, the hosting decision (§8.1) follows from that.

### Other test layers

| Layer | What | When |
|---|---|---|
| Data | `pipeline/99_validate.py` regression checks from BUILD_PLAN §4 | every rebuild |
| Tools | unit tests for each Ask tool against the same regression numbers | every change |
| Extraction | gold set precision/recall per period; regex baseline vs LLM extractor | Phase 2 |
| Prompt injection | poisoned-summary fixture (H11) and system-prompt probes (H06) | every prompt change |
| UI | Playwright: search, county page, coverage map, explorer expand/undo, Ask round-trip, HR/EN toggle, phone width | Phase 1 onward |
| Accessibility | keyboard path through each page, screen-reader check of the list view, contrast ≥ 4.5:1 | each phase |
| Load | the API under 10 concurrent Ask requests on the chosen hosting | before launch |

### Results table (to fill in)

`eval/results/<date>_<hardware>_<profile>.json` per run, and one summary table in `eval/RESULTS.md`:
model × hardware → quality score, valid-JSON rate, p50/p95 latency, peak RAM/VRAM. Commit both.

---

## 6. Future features (backlog, not scheduled)

You mentioned features for later but haven't listed them yet, so these are proposals. Replace or strike as you like.
- Municipality pages (needs a postcode → municipality table, §10).
- **Partner finder:** given an organisation, suggest EU organisations with shared problems/approaches and no existing partnership.
- Compare two counties or two organisations (the "Compare with another county" button on screen 04).
- Topic trends over time and an annual data refresh with a "what changed" page.
- Organisation self-service: "this is my organisation, correct my record" feeding the review queue.
- KA1 mobility integrated as a separate, clearly labelled layer (never mixed into KA2 coverage).
- Saved explorer views and shareable links.
- Open data page: downloadable CSV/JSON and a documented read-only API.
- Real map geometry for counties, once the tile map is validated with users.

---

## 7. First two weeks

1. Add `BUILD_PLAN.md` to `app/`; set up the environment (`duckdb`, `igraph`, `langchain-ollama`, Astro). **S**
2. Load raw data into staging; write `99_validate.py` with the six regression checks (they fail at first — that is the point). **S**
3. Place table and postcode → county. **M**
4. Start organisation resolution; produce the first review queue and measure its size. This sizes the rest of Phase 0. **M**
5. In parallel, hand-annotate the first 25 summaries for the gold set, and draft the Croatian Q&A set. **M**

---

## 8. Decisions I need from you

1. **Hosting the LLM for the public site.** Options: a small GPU server, CPU-only (slow), or a hosted API behind a feature flag. This decides how small the model must be.
2. **EU-wide project pages.** Static pages for all ~46,500 projects, or static for the 3,830 Croatian ones and on-demand for the rest (my default)?
3. **Croatian translations.** I can machine-translate concept and topic labels with Gemma and mark them "unreviewed"; who reviews them?
4. **Organisational e-mails.** Are the registries' public e-mail addresses fine to publish as organisational contacts (§4.12), given they come from public registers?
5. **Gold set.** Are you able to annotate 50–100 summaries per period, or should I propose labels for you to correct?
6. **Gemma 31B keyphrase pass.** Keep it (needs a debugging run first) or drop it, since spaCy keyphrases already exist and Phase 2 supersedes them?
