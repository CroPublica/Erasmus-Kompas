# Project log: Erasmus+ Croatia / KA2 Atlas

What was done, in order, with results, decisions and open problems. Newest state is at the top ("Where things stand").
All work so far is dated 2026-10-28. Paths are relative to the repository root `Erasmus-Kompas/` unless stated.
Numbers are copied from script output; anything not measured is marked as such.

---

## Where things stand

| Area | State |
|---|---|
| EDA reports (4) | done; `EDA/Reports/` |
| Knowledge graph JSON (`EDA/Data/processed/knowledge_graph.json`) | built; extraction quality measured (see §3); Gemma 31B keyphrase pass **still running** (1,462 of 3,830 projects) |
| App environment (`app/`) | done: `setup.sh`, `requirements.txt`, `config/models.yaml`; 8 tests pass |
| App pipeline, Phase 0 | steps 00, 05, 07, 10, 30, 40, 99 written; runs from an empty database in one command; 5 of 7 regression checks pass, 2 fail (see §5) |
| Website, API, Ask page | not started |

**Pipeline steps: 11 planned, 7 done, 1 started, 3 to do.** Done: 00 load raw, 05 Croatian appearances, 07 places, 10 organisation resolution,
30 crosswalks, 40 final tables and views, 99 validate. Started: 50 LLM concept extraction (written and tested on 6 projects, full run waits for the GPU). To do: 51 canonicalisation, 60 graph analysis,
70 site export. (The plan's step 11, "apply review decisions", was folded into step 10; places moved from 20 to 07, see §7.)
The overall plan has 7 phases: 0 (backbone, nearly done), 0b crosswalks (done in step 30, topic map still unreviewed), 1 registry site,
2 extraction, 3 graph and explorer, 4 Ask, 5 first-project ladder.

Regression checks (`app/pipeline/99_validate.py`): **PASS** 1, 2, 3, 5, 7. **FAIL** 4 (150 projects wanted, 151 found; in 2014–2020 we count
71, the reference 70) and 6 (Zagrebačka −16, Brodsko-posavska −6 against tablica 5).

---

## 1. Exploratory data analysis (EDA)

Four reports in `EDA/Reports/`, produced by numbered scripts in `EDA/Scripts/` (01–21), each re-checked by an independent
verification script that recomputes the numbers (0 differences reported).

| Report | Content | Key numbers |
|---|---|---|
| `report_2014_2020.md` | national project list (tablica 1), finance (2), applications (3), EU-wide KA2 file | 2,061 project rows, EUR 145.6M; contracted EUR 155.6M; higher education 46% of listed money; top 10 beneficiaries 38.5%; Croatia in 2,040 KA2 projects, coordinates 252 |
| `report_2021_2027.md` | same for 2021–2026 (tablica 7, 8, 9) | 3,081 project rows, EUR 248.4M; KA2 success rate fell from 33% (2021) to 10–14% (2023–2026); Croatia in 1,790 KA2 projects, coordinates 354 |
| `report_obrazovne_ustanove.md` | the four registers of educational institutions | 885 kindergarten entries, 926 primary, 443 secondary (1,356 distinct schools), 133 higher education |
| `report_erasmus_registri.md` | link of project beneficiaries to the registers; participation by county, founder; KA2 partners | exact-name matching; secondary schools 63.9%, primary 29.9%, kindergartens 6.6% with a National Agency project; with KA2 partners 75.6% / 43.8% / 9.3% |

Data-quality findings recorded in the reports include: sheet `2016` with 16,384 junk columns; 5 duplicated KA105 IDs; one text amount
(`180.147,00 EUR`); school-sector amounts in tablica 1 only 35–90% of the contracted totals; 49 missing youth projects in 2014;
`Župnija` header in the primary-school register; names of persons and contact data in the registers (never reproduced).

## 2. Knowledge graph (EDA scripts 22–24)

- **22_build_knowledge_graph.py** combines the processed CSV files into `knowledge_graph.json` (`{meta, nodes, edges}`), JSON chosen over CSV
  because the data has several entity types with relations. Nodes: Institution, Organisation, Project, Place, County, Founder, Sector,
  CallYear, Action, Statistic. 3,830 projects with a Croatian participant; 547 projects merged between the national list and the EU file.
  Checks: no dangling edges; 5,142 national-list grant lines; 4,389 KA2 appearances. Edge `PARTNER_IN` renamed `PARTNERS_IN`.
- **23_extract_summary_concepts.py** adds Topic, Problem, TargetGroup, Approach, Output nodes from the project summaries. Summaries have
  `<< Background / Objectives / Implementation / Results >>` sections in 91.6% of Croatian 2021–2027 projects (2,187 of 3,830 over both periods;
  2014–2020 summaries are unstructured). No API key was available, so extraction is **rule-based** (regex vocabularies of 103 concepts), not an LLM.
  Also adds aggregated `ADDRESSED_BY` (problem→approach, with project counts and good-practice counts) and `CO_OCCURS` (PMI) edges, and TF-IDF `keywords`.
- **24_concept_graph_analysis.py**: PageRank, Louvain communities (Leiden is not installed), `project_ids` as evidence on aggregated edges.
  First run gave 7 giant communities; excluding "hub" concepts (in more than 20% of projects) and raising the resolution to 2.0 gave 14 readable
  communities (e.g. youth unemployment, STEM, migrants and Roma, sustainability, older adults).

## 3. Extraction quality (EDA scripts 25–27)

- **25_eval_extraction_gemma.py** compares the regex extraction with the local `gemma4:latest` (8B, Ollama) on 100 sampled projects (60 with sections, 40 without).
  Gemma is an imperfect reference, so numbers are agreement, not true precision.
  - Run 1 (answering by list number, all types in one call): regex precision 40–48%. Run 2 (by concept name, one type per call): 53–76%. Part of the gap was the prompt.
  - I judged 32 regex-only edges by hand (8 per type): 17 were right, 15 wrong. Estimated precision ≈ 65% Problem, 85% TargetGroup, 83% Approach, 94% Output (small samples).
  - 22 over-generic patterns were tightened ("stem", "sustainability", "stress", "curricul", "workshops", "volunteer"…). After the fix, agreement with Gemma rose to 58 / 62 / 70 / 78% (Problem / TargetGroup / Approach / Output) while coverage fell (Problem 82%→78%, Approach 94%→90%).
  - Weak concepts remaining: Disadvantaged learners, Researchers & academics, Research report/study, Mobile app/software tool, Storytelling.
  - Report: `EDA/Reports/extraction_eval_gemma.md`.
- **26_extract_keyphrases.py**: spaCy noun phrases, names removed, ranked by TF-IDF, filler adjectives stripped, boost for phrases sharing a word with the TF-IDF keywords. 3,774 of 3,830 projects get `keyphrases`. Cleaner than TF-IDF alone, still some filler ("word document", "panel discussion").
- **27_keyphrases_gemma31b.py**: `google/gemma-4-31B-it` loaded 4-bit with bitsandbytes (19.7 GB GPU, loads in about 14 s, about 2.9 s per project). A 6-project test gave clearly better phrases than spaCy (problem, group, method and output are named). The first two attempts crashed with out-of-memory because I started a second copy while the first still held the GPU (my mistake). The full run is in progress; results are cached in `EDA/Data/processed/keyphrases_llm.json` and written into the graph as `keyphrases_llm` only at the end. Do not start other GPU jobs until it finishes.

## 4. App: planning and scaffolding (`app/`)

- Read `BUILD_PLAN.md` (the specification) and four screenshots (`app/design/screenshots/`: organisation page, graph explorer, coverage map, county page).
- **`IMPLEMENTATION_PLAN.md`**: gap analysis against the EDA work, stack (Python pipeline → DuckDB → Astro site, FastAPI, LangGraph for Ask), repository layout,
  phases 0–5, question answering design (deterministic tools; the model only routes, picks arguments and phrases the answer; a verifier checks citations),
  testing section (§5b: CPU-only vs GPU and several models, replay vs live tests, metrics, proposed thresholds), a backlog of future features, and six decisions for the owner.
- **Environment**: separate `app/.venv` (Python 3.12.9, 78 packages, no torch/CUDA), built by `app/setup.sh` (uses `uv` if present, otherwise `pip`; runs tests; checks Ollama and warns if it listens beyond 127.0.0.1). Verified on a clean copy. `requirements.txt`, `requirements-hf.txt` (optional GPU extras), `requirements.lock.txt`.
- **Model config** `app/config/models.yaml` with roles (ask_router, ask_answer, extraction, translation, embeddings) and profiles `light` (default; Qwen 2.5 3B Instruct for Ask, Gemma 8B for extraction, bge-m3 embeddings), `cpu`, `gemma8b`, `hosted`. Loader `app/atlas/config.py`, switch with `ATLAS_PROFILE`; `max_concurrency` limit for CPU hosts.
  Models `bge-m3` and `qwen2.5:3b-instruct` are now installed in Ollama. Croatian quality of Qwen 2.5 3B is **not verified**; the evaluation set will decide.
- **Ollama bound to loopback**: confirmed it listens on `127.0.0.1:11434` (no `OLLAMA_HOST` override). App default URL changed from `localhost` to `127.0.0.1`. Pinning it in the systemd unit would need `sudo` and was not done.
- **Question set** `app/eval/qa_hr.jsonl`: 78 questions (66 Croatian, 12 English) in 9 groups, with expected answers where a number can be traced (EDA report or screenshot); 4 are "compute from DuckDB". Rubric in `app/eval/README.md`.
- Considered and discussed, not built: how the HR/EN switch treats English source text (original text with a language badge, optional machine translation labelled as such; controlled vocabularies translated once and stored in both languages).
- Rejected from pasted CPU-only advice: "Qwen handles Croatian natively" (unverified), `nomic-embed-text` (English-focused; kept bge-m3), Microsoft GraphRAG `settings.yaml` options (not used here), Croatian-only extraction output (conflicts with English canonical labels plus translation).

## 5. App pipeline, Phase 0 (`app/pipeline/`)

Run everything with `./run_pipeline.sh` (README has the raw-data file list). Output `app/data/atlas.duckdb` (not committed).

| Step | Result |
|---|---|
| **00_load_raw.py** | 14 `stg_*` tables in about 7 s, everything as text. Row counts match the EDA (24,823 and 21,703 KA2 projects; registers 885 / 926 / 443 / 133). Registers are loaded without principals' names, phones, faxes and e-mails. |
| **05_hr_appearances.py** | 4,389 Croatian organisation appearances unpivoted from the 100 partner slots (252 + 2,053 and 354 + 1,730). None sit above slot 38, so the wider CSV changes nothing for Croatia. |
| **07_places.py** (was 20) | postcode → county by majority vote (school registers + tablica 4 county field; never the free-text region). 608 postcodes; 98.7% of Croatian KA2 appearances and 99.5–100% of national-list rows get a county; 7 conflicting postcodes listed in `data/place_conflicts.csv`; overrides go in `data/review/place_overrides.csv` (empty). |
| **10_orgs_resolve.py** | 1,534 distinct (name, postcode) mentions → 1,502 organisations (807 anchored in a registry or tablica 4, 695 new). Matching: exact name + postcode, name + place, name without place, fuzzy within the same postcode (≥ 95 auto, 88–95 to the queue), stored aliases. Faculty/university never auto-merged. The first run queued 20 uncertain pairs; I judged them from the names (14 merges such as spelling variants and two renames, 6 separate faculties or schools) and stored the decisions in `data/review/org_decisions.csv`, each marked as not verified by a person. Two faculties of the same university are now treated as different organisations in code instead of being queued; the queue is empty. 3 English-name aliases in `org_aliases.csv`. 2,374 registry institutions in table `institution`. |
| **30_crosswalks.py** | tables `topic` (76 current), `topic_map` (59 old topics → current: 20 identical names, 57 proposed mappings from `data/review/topic_crosswalk.csv`, 11 of low confidence, **none reviewed by a person**), `org_class_map` (39 EU organisation types → 15 classes), `action_map` (38 action names → 10 families; school exchange partnerships flagged "grant not comparable"). Fails if a value in the data has no mapping. |
| **50_extract_concepts.py** (started) | LLM extraction with the configured `extraction` model (Ollama `gemma4:latest`): problems, target groups, approaches, outputs with planned/reported status, a verbatim evidence quote for each, acronyms expanded, JSON constrained by a schema, results cached per project in `data/extraction_cache.jsonl`, table `concept_mention`. Test on 6 projects: 65 items, 95–100% of evidence quotes found verbatim in the text, 20.7 s per project while the GPU was shared with the 31B job (the full 3,830 would take far too long until that job ends). Items are specific and grounded; weak ones seen: "hindered national development goals" as a problem, "future generations" as a target group, a "self-assessment tool" listed as both approach and output. Prompt version v1; fix these and write the gold set before the full run. |
| **40_build_tables.py** | `project` (3,830; 3,513 national-agency managed, 317 centrally managed and flagged), `project_topic` (13,800 rows), views `v_org_ka2`, `v_county_ka2`, `v_coverage` (Wilson intervals, expected from national rate), `v_hr_participation`, with the three named money measures. 294 projects (7.7%) have no topic at all in the source, so the plan's "every project has a current topic" cannot hold for them. |
| **99_validate.py** | see below |

Regression checks:

| # | Check | Result |
|---|---|---|
| 1 | 3,830 projects with a Croatian participant, 606 coordinated | PASS (from the raw CSVs) |
| 2 | Gimnazija Metković 22 projects, 1 coordinated | PASS |
| 3 | Sveučilište u Dubrovniku 34 projects (6 coordinated) | PASS after the alias "University of Dubrovnik" |
| 4 | Dubrovačko-neretvanska 150 involved, 17 coordinated, EUR 3.72M | **FAIL by one project**: 151 found (2021–26: 80 ✓, 2014–20: 71 vs 70); 17 ✓; EUR 3,719,625 ✓; 33 organisations ✓ after two English-name aliases |

Not a check, an open question: school coverage. The coverage screenshot says 399 of 1,356 schools (29.4%) took part. The pipeline finds **450**. Exactly 399 schools are matched only by exact name and postcode; the other 51 are matched by name + place, name without place, fuzzy match, alias or a review decision. I read the 41 non-exact matches that rest on automatic rules and all look like the same school (diacritics lost in the KA2 text, a neighbouring postcode in the same town, or the town appended to the name), so I believe 450 is closer to the truth, but nobody else has reviewed them. Decision for the owner: which figure to publish.
| 5 | Tablica 7 KA2 grants equal EU export, 139 of 139 | PASS (needs trimming trailing spaces in national IDs) |
| 6 | Tablica 1 by postcode ≈ tablica 5 county counts | **FAIL**: 2,058 vs 2,111 projects; 19 of 21 counties within 3; Zagrebačka −16, Brodsko-posavska −6. No county is over its count, so rows are missing rather than misplaced; their counties are unknown |
| 7 | 4,389 Croatian appearances | PASS |

### Phase 1 started (2026-10-29)

- Node 22.23.4 installed user-local in `~/.local/opt/node` (Astro 7 needs >= 22.23.4; add `~/.local/opt/node/bin` to PATH). `site/` is an Astro project; `npm install`, `npm run build` (3,053 pages in about 6 s).
- `pipeline/70_export_site.py` writes `site/src/data/*.json` (1,502 organisations, 21 counties, coverage; no e-mail addresses). Run it before building the site.
- Pages, each in HR and EN under `/hr/` and `/en/`: coverage map (tiles, Wilson-interval ranking, selected-county panel), organisations list with filter, organisation page (KPIs, participation dots, projects with role filter, countries, topics), places list, county page. Graph and Ask are greyed out in the menu.
- Checked in a headless browser (Playwright, a dev dependency): no console errors, no horizontal scroll at 390 px. The organisation page for Gimnazija METKOVIĆ matches screenshot 01 (22 projects, 10 + 12, 1 coordinator, 120.000 €, 3.27 mil. €, 3 good practice, Italy 11, Türkiye 9).
- Added later the same day: coverage filters for period (2014–2026 / 2014–2020 / 2021–2026) and role (any / coordinator) and a kindergarten filter, fed by the new table `coverage_scenario` (step 40) and rendered by one shared function in the browser; full country names (Intl.DisplayNames; EL = Greece); project pages (10,713 pages in total, build about 14 s); "similar organisations" (same register kind and county, same town first; no distances because there are no coordinates); header search over `site/public/search.json`.
- Tests: `cd site && npm run test:ui` (12 browser tests: filters, HR/EN number format, search, the METKOVIĆ reference figures, phone width, axe WCAG A/AA scan, console errors). The scan found low-contrast "coming soon" labels, fixed. Keyboard pass done 2026-10-29 (scripted in the browser): tab order is logical with a visible 3 px focus ring everywhere, filters, county tiles, ranking and search work from the keyboard (arrows and Escape in search). Two faults found and fixed: focus was lost after selecting a tile (the tiles are redrawn), and the skip link did not move focus (main was not focusable); both now covered by tests (14 in total). Not done: a real screen-reader listening test (NVDA/VoiceOver); only landmarks, headings, names and ARIA state were checked by script.
- Differences from the screens (updated): school coverage shows 33.2 % (450 of 1,356) against the screenshot's 29.4 % (399), which is the open 450-vs-399 question; the e-mail line (not published, owner decision) and the "Explore in graph" button are not built; similar organisations have no distances.

### Deployment setup (2026-10-29)

`build_site.sh` (export, build, optional tests and container image), `site/astro.config.mjs` (`SITE_BASE`, `SITE_URL`), `deploy/Dockerfile` and `deploy/nginx.conf`. The browser tests run against any base path (`SITE_BASE=/atlas node tests/ui.mjs` passes 12 of 12). The container image builds and serves the site (checked: pages 200, unknown page 404, security headers on pages and assets, filters, selection and search work under the content-security policy). Not yet checked: a real host. Fixed on the way: nginx did not pass the server-level security headers into locations that set their own `add_header`; they are now included from `deploy/security_headers.inc`. `astro preview` detaches itself from the process that starts it, so the test script left a server on port 4399 and the next run (with a different base path) talked to the old one; it now stops the listener by port and refuses to start if the port is busy (Linux only, uses `ss`).

### Ask tools, first slice (2026-10-29)

`atlas/tools.py`: nine deterministic read-only tools (`find_organisation` with Croatian case endings, English aliases and registry schools that never took part; `organisation_profile`; `similar_organisations`; `county_stats`; `top_organisations`; `national_stats`; `country_stats`; `coverage` with school type, period and role; `search_projects` keyword only). Each returns rows, citable ids (`project:`, `org:`, `county:`) and caveat notes that name the money measure. `tests/test_tools.py` (14 tests; 22 in all) checks them against the regression numbers. Not built: concept tools (need step 50-60), `success_rate` (tablica 8/9), embedding search, the router, LangGraph flow, verifier, API. Reconciled the expected answers in `eval/qa_hr.jsonl` with the build (see `eval/README.md`). Step 40 now trims project titles and summaries (some titles had a trailing space).

### Ask flow, API and page (2026-10-29)

- `atlas/ask.py`: LangGraph flow (language, route with structured output, tools, answer, verifier). A 3B model routed well enough once the program took over county, period and school-type from the question text, added keyword rules for refusals/KA1/country ranking, and kept a deterministic template answer (default `ATLAS_ANSWER_MODE=template`; `llm` mode lets the model phrase the answer, with the verifier and a template fallback). First live runs showed the 3B model's Croatian answers were garbled and sometimes claimed "no evidence" over real data, which is why template mode is the default for now.
- `eval/run_ask.py` on the 46 questions the current tools can answer: route 46/46, facts 31/31, language 46/46, refusal 9/9, median 0.4 s (template mode). These were tuned while reading the failures, so they are a regression baseline, not an independent score. Skipped: 32 questions that need the concept tools or `success_rate`.
- `atlas/api.py` (FastAPI): 500-character cap, 20 questions per minute per client, at most `max_concurrency` in flight (503 after 20 s wait), no personal data in logs. Run: `uvicorn atlas.api:app --host 127.0.0.1 --port 8000`.
- Site: `/hr/ask/` and `/en/ask/` (question box, example questions, answer with citation chips linking to organisation/project/county pages, "show how I got this" panel with the tools used, follow-up keeps the organisation). The page posts to `/api/ask` (`PUBLIC_ASK_API` overrides at build time); nginx proxy lines are in `deploy/nginx.conf` as a comment. 16 browser tests, API mocked.
- Model comparison, GPU (A100), 46 gradable questions, `eval/results/2026-10-29_gpu_*.json`:

| Router model | Answers by | Route | Facts | Refusals | Median per question |
|---|---|---|---|---|---|
| Qwen 2.5 3B | code (template) | 44/46 | 29/31 | 8/9 | 0.4 s |
| Gemma 4 8B | code (template) | 43/46 | 27/31 | 8/9 | 2.4 s |
| Qwen 2.5 3B | the model, checked | 44/46 | 18/31 | 8/9 | 11.8 s |
| Gemma 4 8B | the model, checked | 43/46 | 18/31 | 8/9 | 23.3 s |
| Qwen 3.5 4B router, 9B answers (thinking off) | the model, checked | 46/46 | 26/31 | 8/9 | 2.8 s |
| Qwen 3.5 4B router, Gemma 4 31B answers | the model, checked | 46/46 | 25/31 | 8/9 | 10.6 s |
| Gemma 4 E4B (router and answers) | the model, checked | 46/46 | 23/31 | 9/9 | 16.3 s |

  The router needs few-shot examples written as JSON: with arrow-style examples Gemma copied the arrows, returned no valid JSON and every question was refused (route 20/46); a failed router now falls back to program rules instead of refusing. First LLM-written answers (Qwen 3B, old prompt): facts 19/31, median 11 s, garbled Croatian. Reruns with the fixed router prompt: neither model writes reliable answers (facts 18/31 for both, with the verifier and template fallback; 11.8 s and 23.3 s per question), so code-written answers stay the default and the model search continues.

### Owner decisions and review document (2026-10-29)

- Model hosting: owner's machine for now, later the deployer's job; `active_profile: auto` picks `light` with a GPU (NVIDIA or Apple silicon) and `cpu` without (`ATLAS_FORCE_CPU=1` forces CPU). The `cpu` profile now uses the plain `qwen2.5:3b-instruct` tag, which is already Q4_K_M (checked with `ollama show`).
- EU pages: project pages link to the project's page on the Erasmus+ Project Results Platform (`results_card_url`, present for every project) and to its own website when it has one; no pages are built for the ~43,000 projects without a Croatian participant.
- Croatian labels: review document with 76 topic names and 130 website strings (drafts by me, unreviewed) at https://claude.ai/artifact/65f8Ttm2AwiDRmBnfVW1BU ; copies in `data/review/topic_labels_hr.csv` and `data/review/ui_strings_hr.csv`. When the owner has edited the document, the corrected Croatian goes into those files and into the site (`label_hr` for topics, `site/src/lib/i18n.ts`). 39 Python tests and 17 browser tests pass.

### Model search results (2026-10-29)

Two model-search reports were pasted by the owner (their claims, e.g. the serbeval scores, are unverified here and used only as hints). Everything below was measured on our own setup.

- Pulled for testing: `qwen3.5:4b`, `qwen3.5:9b`, `gemma4:e4b`, `gemma4:31b`, `qwen3-embedding:0.6b`, `embeddinggemma:300m`. New profiles in `config/models.yaml`: `qwen35` (router 4B, answers and extraction 9B, thinking off), `gemma_e4b`, `gemma31b`; a new `think` setting switches the reasoning phase off for Qwen3.5.
- Code-side rules the reports recommended, already in place: every number in a model answer is checked against the tool output; when the tools find nothing the "no evidence" text comes from code and the model is not called (new test); the router uses a JSON schema; extraction quotes are verified as substrings of the summary.
- **Embeddings, Croatian question to English passage** (Belebele hrv_Latn to eng_Latn, 900 questions, 488 passages; `eval/embed_belebele.py`; the two language files are not in the same row order, aligned by article and question number):

| Embedding model | Recall@1 | Recall@10 | MRR | Time |
|---|---|---|---|---|
| bge-m3 | 0.859 | 0.972 | 0.906 | 22 s |
| embeddinggemma:300m | 0.747 | 0.908 | 0.805 | 36 s |
| qwen3-embedding:0.6b (with instruction prefix) | 0.656 | 0.856 | 0.727 | 61 s |

  bge-m3 stays. Not yet tested: Qwen3-Embedding 4B, and our own 30-50 Croatian queries against project summaries.

### Candidate models, first results (2026-10-30)

Qwen 3.5 9B (thinking off) is the best model-written answer so far: 26/31 facts at 2.8 s, 2 fallbacks to the template. Gemma 4 31B: 25/31 at 10.6 s, 7 fallbacks. Typical faults: raw fractions instead of a percentage (0.5689 for 56.9 %), a requested figure left out (the expected 450, the 1,356 schools), and in one case "no data for Croatia" over a result that had it. Both stay below the code-written answers (31/31, 0.4 s), so code answers remain the default. `gemma4:e4b` failed to load in Ollama 0.30.10 ("Gemma4Assistant requires ctx_other to be set"); after upgrading to Ollama 0.40.13 (2026-10-30, still on 127.0.0.1, models kept) it loads and scores 23/31 at 16.3 s. Its answers can be wrong in meaning while every number is genuine: B01 said "46,526 KA2 projects have a Croatian participant" (the EU total from the tool output), which the number check cannot catch. The scorer now also accepts space-grouped numbers (120 000); `run_ask.py --rescore FILE` regrades saved results.

### Serbian forms and the native-speaker check (2026-10-30)

Pasted model-search notes warn that small models slip Serbian or ekavian forms into Croatian text (tačno, hiljada, opština, gde) and make orthography errors even when grammar scores look fine. The verifier now flags a short list of such forms in Croatian answers (`SERBIAN_FORMS` in `atlas/ask.py`; a flagged answer is retried, then replaced by the template answer). Diacritics are not checked automatically because organisation names in the data are often written without them. For real evidence a native-speaker check is prepared: `eval/native_rating/rating_sheet.csv` (54 blind answers, 9 from each of six systems, columns for spelling and grammar, naturalness, Serbian forms, diacritics, wrong meaning) and `key_DO_NOT_SHOW_RATERS.csv` (which system wrote each item). Two raters should fill the sheet independently.

### GPU focus: polish mode (2026-10-30)

The 16 GB RAM limit is dropped; work targets the A100 (40 GB). Models now stay loaded 30 minutes (`ATLAS_KEEP_ALIVE`). New answer mode `polish` (`ATLAS_ANSWER_MODE=polish`): the model rewrites the code-built draft answer; the verifier requires every figure of the draft to survive and rejects new numbers and Serbian forms; two failures give the draft. A bug in my own number parser (it read "2020., 12" as one number) was found and fixed before these runs.

| Model (router: same family 4B for Qwen, Qwen 4B for Gemma) | Mode | Route | Facts | Refusals | Median | Answers that fell back to the draft |
|---|---|---|---|---|---|---|
| none (code) | template | 46/46 | 31/31 | 9/9 | 0.4 s | – |
| Qwen 3.5 9B (thinking off) | polish | 46/46 | 31/31 | 9/9 | 1.3 s | 14/46 |
| Gemma 4 31B (Q4) | polish | 46/46 | 30/31 | 9/9 | 13.4 s | 19/46 |

Facts are safe by construction; the one Gemma miss is wording ("nije sudjelovala ni u jednom" for the expected "nema"). The open question is naturalness: 30-40 % of answers fall back to the draft, and some polished ones read awkwardly (Qwen: "Sastav bi trebao biti oko 22"). This needs the native-speaker sheet (`eval/native_rating/`), to which polish outputs should be added. **Update, same day.** Higher precision alone barely helped (Qwen 9B fell back on 14, 11 and 12 of 46 at Q4, Q8 and bf16). The real cause was the checker: models answered only the asked part and my rule demanded every figure. New rule (`check_polish`): every number in the answer must come from the draft and at least two of the draft's figures must remain. Results with the new rule (`*_polish2.json`):

| Model | Facts | Fell back to draft | Median | p90 |
|---|---|---|---|---|
| Qwen 3.5 9B Q4 | 31/31 | 2/46 | 1.3 s | 1.9 s |
| Qwen 3.5 9B Q8 | 31/31 | 1/46 | 1.4 s | 2.3 s |
| Gemma 4 31B Q8 | 30/31 | 7/46 | 2.7 s | 4.7 s |

Gemma 31B at Q8 (34 GB) is also 5 times faster than the Q4 build was (13.4 s), probably because the Q4 run swapped models in memory. Answers are now focused (e.g. A02: "Da, ... koordinirala je jedan KA2 projekt pod nazivom Biljna pozornica (2023). Potpore ... 120.000 €."). Scorer note: expected words now match with Croatian case endings (Italija = Italijom). Proposed GPU default: `qwen35_q8` in polish mode; not switched yet, pending the native-speaker sheet (`eval/native_rating/`, regenerated with 8 systems, 7 blind answers each, including the polished ones).

### Owner-suggested models and clean-up (2026-10-30)

Rewrite ("polish") mode, 46 questions, router Qwen 3.5 4B, answer model as listed (`eval/results/2026-10-30_gpu_cand_*_polish.json`):

| Answer model | Facts | Fell back to draft | Median | Wrong-unit error in C03 ("22 %" for "about 22 schools") |
|---|---|---|---|---|
| Qwen 3.5 9B Q8 | 31/31 | 1/46 | 1.4 s | no |
| Gemma 4 31B Q8 | 30/31 | 7/46 | 2.7 s | no |
| OpenEuroLLM-Croatian (8.1 GB) | 31/31 | 0/46 | 7.5 s | yes |
| Gemma 3 12B tools build | 31/31 | 0/46 | 6.9 s | no |
| Qwen 3 14B (thinking off) | 29/31 | 5/46 | 1.3 s | no |
| Mistral Small 24B | 28/31 | 14/46 | 1.2 s | yes |

The unit error passes the number check (22 is in the draft), so the check cannot catch it; only a native reader can. OpenEuroLLM-Croatian, the one Croatian-specific model, is kept until the native-speaker sheet has been rated; it never fell back but is slow and wordier. Deleted from Ollama (about 78 GB freed): mistral-small:24b, qwen3:14b, gemma3-tools:12b, gemma4:e4b, qwen3.5:9b-bf16, gemma4:31b (Q4), qwen3-embedding:0.6b, embeddinggemma:300m, and their profiles removed from `config/models.yaml`. Kept: gemma4:31b-it-q8_0, qwen3.5:9b-q8_0, qwen3.5:9b (Q4), qwen3.5:4b, OpenEuroLLM-Croatian, bge-m3, qwen2.5:3b-instruct and gemma4:latest (your original extraction model).

### Three more UI screens (2026-10-31)

So that the questions asked in chat can also be answered by browsing: `/overview/` (national totals by period, share of all EU KA2 projects, coordinating organisation types, country ranking with Croatia highlighted), the organisation list now sorts (projects, coordinated, name) and filters (period, organisation type, county, coordinators only), and `/projects/` searches the titles and topics of the 3,830 projects with period, action type, partner country and good-practice filters. Data: `national.json` and `public/projects.json` (1.5 MB) from step 70; project summaries are not searched in the browser (too large to send), the Ask backend does search them. Of the 69 answerable evaluation questions, 25 were already answerable in the UI; the 7 national-figure questions and the project search now are too. Still not answerable by anyone: the 32 questions needing the concept layer or success-rate data. 20 browser tests pass.

### DeepSeek R1 distills (2026-10-31)

Tested in rewrite mode like the others (thinking off, router Qwen 3.5 4B; `eval/results/2026-10-31_gpu_ds_r1_*_polish.json`). Bar to keep: 31/31 facts, at most 2 fallbacks, median under 3 s (Qwen 3.5 9B Q8 reaches it).

| Model | Facts | Fell back | Median | Remarks |
|---|---|---|---|---|
| deepseek-r1:8b | 31/31 | 9/46 | 3.6 s | A02 claimed it coordinated 10 and 12 projects (the 10 and 12 are its project counts per period); passed the number check, wrong meaning. "22 %" unit error in C03 |
| deepseek-r1:14b | 30/31 | 3/46 | 6.2 s | clumsy wording ("U totalu") |
| deepseek-r1:32b | 29/31 | 1/46 | 11.9 s | left out the figures asked for in C01; slowest |

All three deleted from Ollama (about 34 GB) and their profiles removed. The full DeepSeek V3 family (about 400 GB) does not fit the A100. Kept after this round: qwen3.5:9b-q8_0, qwen3.5:9b, qwen3.5:4b, gemma4:31b-it-q8_0, OpenEuroLLM-Croatian (pending the native-speaker ratings), bge-m3, qwen2.5:3b-instruct, gemma4:latest.

### Activity summary document (2026-10-31)

Owner request: what are the most common activities, outputs and other aspects of KA2 projects, and what to expect when starting from scratch. `analysis/activities.py` counts 33 activities (surveys, interviews, workshops, pilots, platforms, events, evaluation and so on) in the English summaries of 3,804 projects with a rule-based word list, groups them into five stages, and writes `data/activities.json` (counts per period, co-occurrence). Three patterns that were too loose on a five-sample read (toolkit/methodology, bare "evaluate", bare "network") were tightened; no full accuracy measurement exists. Document with a flow chart, a cluster diagram, activity and output tables, target groups, topics, size and money: https://claude.ai/artifact/JRQCY2EP1SNZcLXGnsuiDQ . It is to be redone from the model extraction once the gold set has validated it. Findings: median project 5 countries; 82 % involve learning with people, 80 % develop materials, 71 % share results, 47 % describe evaluation, 31 % research first, 13 % mention all five stages; exchanges fall (43 % to 25 %) while pilots (18 % to 32 %) and toolkits (27 % to 38 %) rise between 2014-2020 and 2021-2027.

### Topics over time (2026-11-01)

Question: does the data give a timeline of topics, and does it make sense. Answer: yes for broad topics, with limits. The EU replaced its topic list in 2021, so the new Topics page (`/hr|en/topics/`) and the document use the labels exactly as the source gives them for each period (no crosswalk) and draw one continuous line only for topics that have the same name in both lists (18 occur in both periods; 34 only in 2014-2020, 57 only in 2021-2027); other topics start or stop at the break (dashed line, "topic list changed"). Shares use the projects with a topic in that year (113 to 586 a year; 2026 partial, hollow points). Readable examples: environment and climate 4-8 % until 2019, about 20 % since 2021; entrepreneurial learning 25 % in 2015, 3 % in 2025; AI and data usage from 2023. Not meaningful: word matches of COVID in old projects (summaries of finished projects mention it later), and any "digital skills" line across 2021 (old name "ICT - new technologies - digital competences" was linked only by the unreviewed crosswalk). Export: `topics_by_year.json` (step 70). 21 browser tests pass; a hidden-attribute bug (inline display:flex overrode `hidden`) was found by the filter test and fixed globally.

### Extraction prompt v2 and model choice (2026-11-01)

All 25 gold projects reviewed (8 thoroughly by one reviewer, 17 lightly by the other); precision 100 % with nothing unticked, so only recall is informative, and only on the thorough set. Prompt v2 (`PROMPT_VERSION`, higher caps, implied needs, every activity, expected results as well as products) scored by meaning (`eval/gold/score_extraction.py`, bge-m3 cosine >= 0.72), thorough reviews, 8 projects:

| Extractor | Problems | Approaches | Outputs | Target groups | Per project (approaches, outputs) | Time per project |
|---|---|---|---|---|---|---|
| Gemma 4 8B, prompt v1 | 62 % | 58 % | 79 % | 100 % | 2.5, 2.6 | – |
| Gemma 4 8B, prompt v2 | 76 % | 78 % | 93 % | 100 % | 4.9, 6.4 | 10.8 s |
| Qwen 3.5 9B Q8, prompt v2 | 86 % | 97 % | 96 % | 84 % (100 % at 0.65) | 9.0, 8.6 | 13.6 s |
| Gemma 4 31B Q8, prompt v2 | 90 % | 81 % | 86 % | 0 % (it returned almost no target groups) | 5.2, 8.4 | about 25 s, 1 of 25 timed out |

Choice: Qwen 3.5 9B Q8 with prompt v2. Its extra items (not in the gold set) were read on a sample of 24: most are real, concrete details reviewers did not add; about one in five is generic administration or dissemination, so `concept_mention.generic` flags those (`GENERIC` in step 50) for exclusion from method counts. The full run (3,830 projects, about 14 hours at the measured speed) has NOT been started: the owner is asked first.

### Success rate, bugs found by the load and end-to-end tests (2026-11-01)

- New step `pipeline/35_applications.py` (tablica 3 and 9) and tool `success_rate`; checks against the files' grand totals pass. KA2 2021-2026: 2,106 applications, 322 contracted (15.3 %); 2023: 405 / 49 / 12.1 %; 2014-2020 has one figure for all actions (5,277 / 2,111), no KA split exists. Three more evaluation questions can now be graded (49 in all).
- Load test (`tools/load_test.py`, 10 questions at once through the container proxy) found a real bug: one request in ten failed with a server error because all threads shared one DuckDB connection. Fixed with one cursor per thread; a 16-thread regression test was added; afterwards 10 of 10 succeed in 1 to 2 s, and the per-minute limit returns 429 after 20 questions.
- End-to-end browser test with no mocks (`site/tests/e2e_ask.mjs`: container, proxy, real API, real router model): 5 of 5 pass (figures, sources, follow-up keeps the organisation, English success-rate answer, a refusal).
- The small router over-used the new `success` route; it now needs keywords (`SUCCESS_WORDS`), a county in the text turns a national route into a county route, and an organisation route with no organisation named becomes national. Template mode now scores route 49/49, facts 34/34, language 49/49, refusal 9/9 (GPU) and the same on CPU.
- CPU-only (Ollama on port 11435 with no GPU, 16 cores): the `cpu` profile (3B router, code-written answers) 49/49 route, 34/34 facts, median 0.7 s. Rewrite mode with Qwen 3.5 9B (4-bit, router Qwen 3.5 4B, profile `cpu_qwen35`) on CPU, 12 questions: route 12/12, facts 11/12, no fallbacks, median 13 s (10 to 27 s). The one miss was an answer saying the total "cannot be extracted" although the data had it: the verifier's list of false no-evidence phrases now includes such wordings (test added).
- Container: nginx.conf is now a template (`ASK_API_URL`, default http://127.0.0.1:8000) so `/api/` is proxied; tested with `docker run --network host`.
- Version control: the project IS a git repository (`Erasmus-Kompas`, remote CropPublica/Erasmus-Kompas); an earlier note saying otherwise was wrong. Generated site data (`site/src/data/projects_full.json`, 17 MB) is tracked and changes on every export; consider ignoring and untracking it.

### Full extraction started (2026-11-01 15:20; owner approved)

`pipeline/50_extract_concepts.py --profile qwen35_q8 --prompt v2` over all 3,804 projects with a summary (tag `qwen3.5:9b-q8_0|v2`; the 25 gold projects and the ones already done are cached, so it resumes). Speed findings: Qwen 3.5 cannot serve parallel requests in Ollama ("model architecture does not currently support parallel requests"), and three server copies on one GPU were slower (5 per minute) than one (about 6 per minute: 10.4 s per project, about 800 generated tokens at 92 tokens a second; the strict output format costs nothing). So it runs as one process against one Ollama server on port 11436 (`OLLAMA_NUM_PARALLEL=4 OLLAMA_KEEP_ALIVE=30m OLLAMA_HOST=127.0.0.1:11436 ollama serve`), about 10.7 hours in all, log in `data/extraction_run.log`. The script no longer holds the database during the run (only at the start and the end), so the API, tests and site export keep working; at the end it writes the table `concept_mention`. If it stops, run the same command again: finished projects are skipped. Step 50 also reads `ATLAS_OLLAMA_URLS` (several servers) for models that do serve parallel requests.

### Step 51, merging near-duplicate concepts (2026-11-01, built while the extraction runs)

`pipeline/51_canonicalise.py` reads the extraction cache for a tag and groups phrases of one kind that mean the same: embeddings (bge-m3), leader clustering by frequency, and guards that stop the over-merging seen in the first trial on 125 projects (public vs private sector, 90 vs 120 ECTS, Serbia vs Croatia, water vs soil issues, green vs digital skills): numbers must match, listed opposites never merge, phrases of more than 6 content words stay separate, a phrase may join another only by ADDING at most one word (or above cosine 0.93), and a word replaced by another needs cosine 0.97. Less merging is the safe failure: results on 147 projects merge peer learning (6 phrasings), exchange of practices (5), training of trainers (4), micro-credentials (4), workshops (4) and keep opposites apart. Writes tables `concept`, `concept_map`, `project_concept` and `data/review/concept_labels_hr.csv` (concepts in at least 3 projects, for the Croatian labels). It has not been run for real yet: that waits for the full extraction. `tests/test_canonicalise.py` (4 tests); 58 Python tests pass.

## 6. Findings about the raw data

- `tablica_7` CSV holds call years 2024–2026 only (1,856 rows); the `.xlsx` holds 2021–2026 (3,081). Check 5 uses the 2024–2026 rows.
- `tablica_1` CSV has 2,058 rows, the `.xlsx` parse gave 2,061 (2016 differs by 3).
- National project IDs carry trailing spaces or lack a hyphen (e.g. `2024-2-HR01-KA210-ADU000280988`).
- Tablica 1 and 7 CSVs contain town and postcode columns, richer than the `.xlsx` parsed in the EDA.
- Tablica 4 (2014–2020 only) gives OIDs and clean county names for 855 organisations; there is no OID source for 2021–2027.
- KA2 CSV has 621 columns (100 partner slots); the `.xls` the EDA used has 249–250.
- English names of the same organisation occur ("Museums and galleries of Konavle", "Primary school Vladimir Nazor Ploce", "University of Dubrovnik"); an alias list handles them.

## 7. Mistakes and corrections

- Started a second Gemma 31B run while the first was alive: both ran out of GPU memory. Fixed by running one copy.
- **Step order bug**: step 10 needs the `place` table from step 20, but ran before it; earlier runs only worked because the table already existed. Found by rebuilding from an empty database; places renumbered to 07.
- Reported the Gemma 31B test as "loading" when it had crashed; corrected once the log was read.
- First Gemma evaluation prompt (answer by number) understated agreement; rerun by concept name.
- Regex vocabulary had over-generic entries that I found by reading disagreements and then tightened.

- 2026-10-29: `./run_pipeline.sh --from 05` ran step 50 (the full LLM extraction) because the runner executed every step. Stopped after one project; nothing lost. The runner now skips steps 50–98 unless `--llm` or `--only NN` is given.

## 8. Open problems and next actions

1. **Check 4** (looked at 2026-10-29): 151 projects involve Dubrovačko-neretvanska against 150 wanted; coordinated (17), money (€3,719,625) and organisations (33) match, so the extra one is partner-only. The data cannot say which: no reference list exists (the 150 comes from the spec). `data/review/check4_candidates.csv` lists the projects whose only link to the county is an organisation matched by name or alias rather than by registry (45 rows, 16 of them 2014–2020; the last column is for you to mark the extra one). Vela Luka's postcode 20270 is a recorded conflict (majority Dubrovačko-neretvanska, which is right: Vela Luka is on Korčula). If a reference list is not available, accept 151 as a documented deviation.
2. **Check 6**: all tablica 1 CSV rows join a postcode; 5 rows repeat a project number. Three 2016 KA107 projects found in the xlsx but not the CSV (Međimursko veleučilište, Veleučilište u Požegi, Sveučilište Sjever) are added through `data/review/tablica1_supplement.csv` (loaded by step 00), so 2,061 are placed against 2,111 in tablica 5 (shortfall 50, mainly Zagrebačka -15, Brodsko-posavska -6). For the rest, `data/review/tablica1_supplement.csv` has one `FILL IN` row per missing project, grouped by county (`tablica1_county_gaps.csv` shows the counts); fill project number, name, postcode and amount from any other source and rerun `./run_pipeline.sh`.
3. **School coverage 450 vs 399**: RESOLVED 2026-10-29. 399 schools match by exact name + postcode; the other 51 were reviewed by the owner (with the EU organisation register as a second source: 36 supported, 2 several entries in the town, 13 nothing found) and **all 51 were marked correct**. The published figure is therefore 450 of 1,356 schools (33.2 %). Decisions stored in `data/review/school_matches_to_check.csv` (column `correct? (yes/no)`); no school needed a stored `no` decision.
4. **Unreviewed human-input files**: `org_decisions.csv`, `org_aliases.csv`, `place_overrides.csv` and `topic_crosswalk.csv` were filled in by me from names or geography; a person should spot-check them (the topic map has 11 low-confidence rows).
5. 294 projects have no topic in the source; decide whether to derive topics from the extracted concepts.
6. Next pipeline steps: finish 50 (tighten the prompt, annotate a gold set of 50–100 summaries per period, then run all 3,830 once the GPU is free), 51 (canonicalisation, Croatian labels), 60 (graph, Leiden, community reports), 70 (static JSON for the site); then Phase 1 (site, needs Node.js).
7. Gemma 31B keyphrase run (EDA): finished 2026-10-28; `keyphrases_llm` is in the graph for 3,794 of 3,830 projects (36 without; cause not checked). Samples read as topics, spaCy's as noisier; keep Gemma, spaCy as fallback (judged by eye, not measured).
7b. Gold set: `eval/gold/batch_01.md` (25 projects, proposed items as checkboxes) is being reviewed by the owner; then run `python eval/gold/read_gold.py` for precision/recall per concept type. Tools: `eval/gold/make_batch.py`, `read_gold.py`; step 50 takes `--ids FILE`.
8. Owner decisions in `IMPLEMENTATION_PLAN.md` §8. Decided 2026-10-29: e-mail addresses are **not** published. Still open: LLM hosting, EU-wide project pages, Croatian label review, gold-set annotation, keyphrase pass.

## 9. How to reproduce

```
cd app
./setup.sh                      # environment (add --pull-models for Ollama models)
./run_pipeline.sh               # steps 00, 05, 07, 10, 30, 40, then the checks (exit code 1 while checks 4 and 6 fail)
./run_pipeline.sh --check       # checks only
# EDA scripts: Erasmus-Kompas/EDA/Scripts/*.py in the base conda env (see each script's docstring)
```

- Croatian labels reviewed by the owner (2026-11-01, from `eval/gold/KA2_Atlas_Croatian_labels_for_review.docx`): 9 of 76 topic names and 34 of 130 website strings changed (the other 3 strings are year ranges that were not in the document). Reviewed wording is in the `*_reviewed` columns of `data/review/topic_labels_hr.csv` and `ui_strings_hr.csv`, applied in `site/src/lib/i18n.ts`. Topic names now show in Croatian on the topics, organisation and project pages (`topic_labels.json`, `topicName()`); topics only in the 2014–2020 list have no Croatian name and stay in English. Site rebuilt: 58 Python tests and 21 browser tests pass. Style of the reviewed text: formal "Vi" (Pitajte, Postavite pitanje).

- Topic crosswalk (58 rows, 40 old topics -> 46 current topics) reviewed and accepted by the owner on 2026-11-02; `reviewed=true` in `data/review/topic_crosswalk.csv`.

- Full extraction finished 2026-11-02 (qwen3.5:9b-q8_0, prompt v2): 113,850 concept mentions, 3,795 projects with at least one. Step 51 run at tau 0.80 (0.86 gave almost the same: lowering tau barely merges more, the guards and the free wording are the limit). Tables `concept`, `concept_map`, `project_concept`, `concept_theme`. Phrases are mostly project-specific: share of mentions in a concept shared by ≥2 projects is 62 % for target groups, 34 % approaches, 11 % outputs, 7 % problems. `concept_theme` points each concept used by <5 projects at the nearest concept used by ≥5 projects (similarity ≥0.75), for approaches (11,161 concepts) and target groups (5,259) only; sampled by eye: mostly right, some wrong (e.g. "co-teaching best practice" -> "co-creation of best practices"), so shown as "related theme", not merged. Problems and outputs are not attached (wrong too often). Mentions under a frequent concept or theme: approaches 59 %, target groups 81 %. Step 51 now bulk-inserts through a CSV (row-by-row executemany took over 30 minutes) and caches embeddings in `data/concept_embedding_cache.npz`. Croatian concept labels needed for 2,343 concepts used by ≥3 projects: `data/review/concept_labels_hr.csv`.

- `org_aliases.csv` (3 aliases) and `place_overrides.csv` (10436 -> Zagrebačka) checked by the owner on 2026-11-02; notes updated.

- Higher-education linking (2026-11-02): the higher-education registry has no postcodes, so name+postcode matching linked only 1 of 133 entries. Step 10 now links by name + town (`he_canon` in `pipeline/names.py`): 25 registry entries joined to organisations already known from tablica 4, plus 18 spellings of faculties linked to their register entry (method `6 higher-ed name+town`). Pomorski fakultet u Rijeci, which existed twice, is one organisation now. Organisation count 1,502 -> 1,501; checks 2, 3, 5, 7 still pass (Dubrovnik 34 projects). For the owner to check: `data/higher_ed_links_to_check.csv` (generated on each run). Registry names now replace the EU export spelling for organisations matched to a register, and all-capital registry names are shown in normal case (`display_name`).

- EU organisation IDs found by the owner for 6 organisations that tablica 4 does not list (H-4ced0bb440, H-41e5e8349e, H-f6954d90ff, H-6888519127, MBU-112, KG-14c0e6f0f2): `data/review/org_oids.csv`, stored in `organisation.eu_oid`; identities and URLs unchanged. Not checked by Claude. Kept from the lookup: faculties have their own OID (supports not merging a faculty into its university); an invalidated duplicate Porin record E10088790 must not be used.

- Croatian concept names drafted (step 52, gemma4:31b-it-q8_0, 2,343 concepts used by >=3 projects, 26 minutes): `data/review/concept_labels_hr.csv` (column label_hr_draft) and the review workbook `data/review/KA2_Atlas_concept_labels_hr.xlsx` (sheets Target groups, Approaches, Outputs, Problems). Not reviewed yet. 113 Croatian wordings are used for more than one English label (merge candidates); a few grammar slips seen (e.g. "niskim razinom kvalifikacija").

- Concept graph and Ask (2026-11-02): step 60 `pipeline/60_graph.py` (Leiden, resolution 2.0): 1,231 nodes (frequent concepts + 75 EU topics), 7,830 edges, 24 communities of which 19 have >=20 projects (shown as profiles); 2,244 of 3,795 projects match a community. Tables graph_node, graph_edge, community, project_community; `concept_label` (Croatian names, step 52 --load-only). New Ask tools search_concepts, concept_profile, common_concepts, community_overview and the `concepts` route (answers by code in both languages, caveat sentence always attached); keyword project search falls back to concept names when it finds nothing ("projekti o robotici"). 64 Python tests pass. Resolution 1 gave two giant communities, 3 and 5 many tiny ones; communities partly follow action type and period (e.g. C04 255 of 263 projects are 2014-2020 school exchanges), which is stated on the page.

- Site (2026-11-02): new pages /methods/ (typical project; all approaches with share per period, good-practice share with 95 % range against all projects; views Most used / Growing / Fading / Less used) and /graph/ (concept search with what goes together, 19 groups of concepts); nav item "Explore graph" is now a link. Data `site/src/data/graph.json` (275 KB) written by step 70; text in `site/src/lib/conceptText.ts` (Croatian is a draft). 23 browser tests (axe on the new pages included) and 64 Python tests pass. Still to do: redo the activities document from the full extraction; concept labels review by the owner; load reviewed labels with `52_label_concepts_hr.py --load-only` and rerun step 70.

- Checks 2026-11-02 (concept layer): Ask evaluation with the real router, 73 graded questions: route 72/73, facts 34/35, language 73/73, refusal 9/9, concept questions answered 22/24 (the two honest "no evidence": a repair-cafe project and aliases of a term; GPU `light` and CPU `cpu` profiles give the same, CPU median 0.7 s). New tools concept_trends and connected_concepts; Ask sources of kind concept link to /graph/#id. Fixed: an "organisation" route with no organisation but a named county now becomes a county question (the real router moved a grants-by-county question there). Browser end-to-end through the container, proxy and real models 7/7, load test 13 at once 13x 200 (median 1.3 s), 68 Python and 23 browser tests pass. `eval/run_ask.py` now grades concept questions (route concepts/project_search, "answered").

- Graph, Ask and demo work (2026-11-02, evening): the graph page is now an interactive network (d3-force, `site/src/lib/graphView.ts`): all groups as bubbles, one group sorted into kind sectors, one concept with what goes with it; zoom/pan, drag, "show more", hidden overlapping labels, keyboard, `#group-<id>` links; kind is shown by shape and sector label as well as colour because five hues cannot all be told apart (validator). Ask: list questions narrowed by a concept ("approaches for students with fewer opportunities") now use that concept's neighbours instead of the overall list, and say so when the named concept is not found; concept search falls back to meaning (bge-m3 vectors of the 1,156 concept names in `concept_vec`, similarity >= 0.67; "rani prekid školovanja" -> early school leaving, "kakvo je vrijeme" -> nothing). Ask page restyled as a chat (composer, question bubble, answer card). Step 61 names the groups (draft, owner review). Group assignment rule left at >= 4 shared concepts: lowering it to 3 would reach 84 % of projects but sits near chance (hypergeometric test; today's rule is about p < 0.01). Public demo: password (nginx basic auth), per-visitor rate limit behind a proxy, e-mail addresses removed from project summaries and from two old EDA files, `deploy/public_demo.sh`, systemd units. Tests: 74 Python, 26 browser.

- Native-speaker rating (2026-11-03): two raters (Nikola, Matea) rated 56 answers from 8 systems (7 each: template `code`, 2 polish modes, 5 free-text models) in `eval/gold/rating_sheet_rated_combined.csv`; summary `eval/results/native_rating_summary.md` (`eval/gold/summarise_rating.py`), agreement `eval/gold/interrater_agreement.py`. Raters agree on spelling within one point in 80 % of items and on ekavian forms (96 %) and wrong meaning (93 %); they disagree on how natural an answer sounds (exact 14 %, kappa 0.02; Matea 4.4 vs Nikola 3.0 on average) and on diacritics (Matea flags 20 items, Nikola 4). OpenEuroLLM-Croatian was not in the sheet. Template wording changed after the ratings: 'Najčešće partnerske zemlje: ...' instead of a nominative after 's'.

- Data decisions (2026-11-03, owner): check 4 now expects 151 (raw recount with a space-tolerant postcode gives 151; the 150 of the first prototype is not reproducible); check 6 passes when the total shortfall against tablica 5 is within 3 % (now 50 of 2,111, 2.4 %); the NGO figure 168 is kept with a footnote (154 typed + 6 filled + 8 European civil-society organisations). All 7 checks pass. OpenEuroLLM-Croatian deleted from Ollama and its profile removed. Faculties are shown as 'university, faculty' (registry parent institution); group names and concept labels are the model drafts (3 and 2 ekavian or malformed phrases corrected).
