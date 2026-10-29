# KA2 Atlas — build plan

A public website showing Croatian participation in **Erasmus+ KA2 partnerships, 2014–2026**:
who took part, where, with whom, on which problems, and with what money.
Graph-based exploration is the core; every page opens into the graph and back.

Screens: `screenshots/01-organisation-page.png`, `02-graph-explorer.png`, `03-coverage-map.png`,
`04-county-page.png` (rendered from real data; explorer concept labels are illustrative).

---

## 1. Questions the site must answer

| # | Question | Answered on |
|---|---|---|
| 1 | Find your organisation: full KA2 record, or "No KA2 projects found since 2014" | Organisation page (screen 01) |
| 2 | Similar organisations: same sector and type, nearby, public contacts | Organisation page panel |
| 3 | First project: most common first project per sector, typical grant, success rate | Topic / sector page (Phase 5) |
| 4 | Coverage map: share of institutions with projects per county, intervals, expected vs actual | Coverage map (screen 03) |
| 5 | Town and county pages: projects, money, organisations in a place | Place page (screen 04) |
| 6 | Extraction of problems from project descriptions | Project page, Concept pages |
| 7 | Problem → solution search, Croatia or EU | Search + Concept page + explorer (screen 02) |
| 8 | Most connected concepts ("what everything flows through") | Explorer, Influence lens |
| 9 | Sub-clusters of the graph | Explorer cluster overview |
| 10 | Ask a question, trace a path, explain a concept | Ask, Paths, Concept page |
| 11 | How much each country has spent / received | Country page |
| 12 | Who participates from each country | Country page, Place page |

## 2. Audiences

| Audience | Comes to | Entry |
|---|---|---|
| Schools, NGOs, municipalities | find themselves, peers, a first step | search own name |
| Citizens, journalists | what happens in my town; what the money did | map, town search |
| Policy (AMPEU, ministries, counties) | coverage gaps, trends, themes | coverage map, clusters |
| Researchers | problems, approaches, connections | explorer, Ask |

## 3. Information architecture

**Entity pages** (one template each): Organisation · Project · Place (county, town) · Country ·
Topic (76 programme topics) · Concept (problem / approach / target group) · Cluster.

**Global tools:** Search (all entity types) · Explorer (graph) · Coverage map · Paths · Ask.

Every entity page has "Explore in graph"; every graph node has "Open page".

---

## 4. Data rules (decided)

These came from profiling the source files. Breaking them produces wrong numbers on the site.

1. **Scope is KA2.** Titles say "KA2 partnerships", never "Erasmus+". Empty state: "No KA2 projects
   found since 2014". KA1 rows from national lists may appear only as a note ("also active in KA1 mobility").
2. **Grants belong to projects.** Never split a grant between partners. Three named measures only:
   - *Grants coordinated* — projects where the org/place is coordinator.
   - *Value of projects involved in* — distinct projects, full grant; **never summed across places**.
   - *Participations* — counts, no money.
   National totals come from distinct projects, never by adding counties.
3. **Geography comes from postcode** → county (majority vote across sources), never from free-text
   town/region fields (they contain errors and NUTS-2 regions). Postcode areas ≠ municipalities.
4. **Key action comes from the project code**, not label columns (63 national rows are mislabelled).
5. **Organisations are matched on name + postcode**, never name alone ("Obrtnička škola" exists in
   several towns). OIDs (Tablica 4) and registry codes anchor identity. Uncertain pairs go to a
   human review queue; decisions are stored and re-applied on every rebuild.
6. **Stable organisation ids:** `OID-<oid>` → registry key (`MZO-<šifra>`, `MBU-<mbu>`) → hash of
   name + postcode. Page URLs depend on them.
7. **Grant source:** EU export for every period. National lists disagree for 2014–2020
   (204 of 240 KA2 projects differ) and are for reconciliation only.
8. **Centrally managed projects** (numeric or `EPP` ids) are included and flagged; they are absent
   from AMPEU tables.
9. **School exchange partnerships** (KA219/KA229) pay each school separately — label their money as
   not comparable.
10. **Success rates** only from Tablica 9 (2021–2026, national, by sector × key action). Never per
    organisation; none for KA2 in 2014–2020.
11. **Coverage denominators** exist for schools, kindergartens, higher education only. Exclude
    short-programme providers from kindergarten coverage. Deduplicate schools listed as both
    primary and secondary.
12. **Privacy:** organisational e-mails only (ured@, tajnistvo@, info@…). Never show principals',
    deans' or other personal names.
13. **Planned ≠ achieved.** Ongoing projects' outputs are "planned". Rank solutions by evidence
    (good-practice flag, results available, finished).
14. **Provenance on every figure:** source, date, "2026 partial", method note.
15. **Recompute totals; never trust printed totals** (Tablica 6 prints 4,775 for a row set summing to 8,556).

### Regression checks (must hold after every rebuild)
- 3,830 projects with a Croatian participant; 606 coordinated from Croatia.
- Gimnazija Metković: 22 projects, 1 coordinated.
- Sveučilište u Dubrovniku: 34 projects (name variants merged).
- Dubrovačko-neretvanska: 150 projects involved, 17 coordinated, €3.72M coordinated.
- Tablica 7 KA2 vs EU export: 139 of 139 grants identical.
- Tablica 1 projects placed by postcode reproduce Tablica 5 county counts within a few per county.

---

## 5. Data model

| Table | One row per | Notes |
|---|---|---|
| `project` | KA2 project, all countries | period, call year, action level, sector, management, grant, status, good practice, summary |
| `participation` | organisation × project | role, country, county (HR) |
| `project_topic` | project × topic | topic lists differ by period |
| `topic_map` | old topic → new topic | crosswalk, 59 → 76 |
| `organisation` | resolved Croatian organisation | name, EU type, postcode, town, county, OID, registry key, public e-mail, identity basis |
| `org_alias` | spelling × source | all raw names |
| `place` | postcode | town, county, conflicts |
| `institution` | registry entry | coverage denominators |
| `national_grant` | AMPEU list row | reconciliation only |
| `concept`, `project_concept`, `concept_edge`, `community` | extracted layer | Phase 2–3 |

Aggregates as SQL views: `v_county_ka2`, `v_org_ka2`, `v_coverage`, `v_hr_participation`.

## 6. Architecture

```
raw CSVs ─► Python pipeline ─► DuckDB ─┬─► static JSON per entity ─► static site (Astro or Observable Framework)
                │                      ├─► graph files: nodes, edges, communities, precomputed layouts
                └─► LLM extraction ────┴─► vector index: section chunks, concepts, community reports
                                                     │
                                small API: search · path · Ask ◄┘   (FastAPI)
```

- Entity pages pre-built: fast, cheap, indexable. The API is the only live component.
- Graph: computed in Python (igraph + Leiden); browser receives only the neighbourhood requested.
- Rendering: Cytoscape.js for ego networks; Sigma.js (WebGL) only for the cluster overview.
- Search: Typesense / Meilisearch, or pgvector for hybrid keyword + embedding search.
- EU-wide projects (~46,500) reachable via search and paths; never loaded wholesale into the canvas.

## 7. GraphRAG design

**Two layers**
- *Structured* (from metadata, exact): project, organisation, place, country, year, action, 76 topics,
  grant, good-practice flag.
- *Extracted* (LLM, fixed JSON schema): problems, target groups, approaches, outputs/outcomes, each with
  `status` (planned/reported) and an evidence pointer to the source sentence.

**Pipeline**
1. Split summaries by `<< Background >> / << Objectives >> / << Implementation >> / << Results >>`
   (90% of 2021–2027, 25% of 2014–2020); fall back to whole text.
2. Extract per project; expand acronyms defined in the text; drop project names and programme
   boilerplate ("European added value").
3. Canonicalise: multilingual embeddings → cluster near-duplicates → one canonical label per cluster
   (+ Croatian translation) → aliases kept → attach to the 76 topics.
4. Edges: `ADDRESSES` (project→problem), `USES` (project→approach), `PRODUCES` (project→output),
   aggregated `ADDRESSED_BY` (problem→approach with n_projects, n_good_practice), concept
   co-occurrence weighted by PMI.
5. Leiden communities on the concept graph; one LLM report per community.
6. Index chunks, concepts and community reports.

**Retrieval**
| Feature | Route |
|---|---|
| Problem → solution | query → problem nodes → `ADDRESSED_BY` → approaches ranked by projects & good practice → HR/EU filter |
| Most connected | betweenness / PageRank on PMI-weighted concept graph |
| Clusters | Leiden communities + reports |
| Explain concept | node + aliases + top projects + community report + neighbours |
| Trace path | weighted shortest path, hub concepts excluded; each hop cites projects |
| Ask | local: concepts + neighbourhood + chunks; global: map-reduce over community reports; always cite |

**Quality:** hand-annotate 50–100 summaries per period as a gold set (e.g. in INCEpTION); measure
precision/recall before scaling. Version prompt + schema; store version on every extracted node.

---

## 8. Design guidelines

### Visual system
- Fonts: **Archivo** (headings condensed ~80–85% width, 800 weight; body regular) and
  **JetBrains Mono** (kickers, codes, table numbers).
- Colours: ink `#16181D`, ground `#F4F5F2`, surface `#FFFFFF`, lines `#D9DCD6`, muted `#555B66`;
  accent cobalt `#2448C9`; amber `#D9822B` (text `#8A4A0F`) for good practice / below expected /
  selection.
- Node types: problem `#FBE9D7`/`#B85F14`; approach `#DDF1EE`/`#0F7B6C` pill; project white with
  `#5E6470` border (thick dark border = Croatian participant); topic `#EFEAF8`/`#3F2A78`.
- Map ramp: `#DCE4F7` `#B5C6EE` `#85A0E2` `#3D5FC4` `#1E3A9E`.
- Contrast ≥ 4.5:1; colours also differ in lightness; blue/orange, never red/green.
- Touch targets ≥ 44 px; real `<button>`, `<a>`, `<label>`; works at phone width.
- Croatian number format (`1.234.567,89 €`, `29,4 %`); medians for grants.
- Croatian first, English toggle; concept labels stored in both languages.

### Page anatomy (screens 01, 04)
Header (wordmark, nav, search, HR/EN) → breadcrumb → mono kicker → condensed title → one-line
context → identity badges → primary action "Explore in graph" → KPI tiles (each money tile names its
measure) → content sections → footer with sources, dates, caveats.

### Graph explorer (screen 02)
- Three panes: left search / lens / filters / legend; centre canvas with breadcrumb trail, undo,
  Graph | List toggle, "Trace a path"; right detail panel (description, counts, strongest evidence,
  Croatian projects, Open page · Expand +N · Path from here).
- Lenses: Who · Where · What · Influence. Filters: Croatia / Croatia + EU, period, good practice, finished.
- Always seeded; ≤ 50 nodes; ≤ 15 per expansion with "show more"; existing positions pinned on expand.
- Edge thickness = supporting projects; hover shows "N projects · M good practice".
- Hub topics hidden by default, with visible "show".
- Banner whenever labels or counts are provisional.
- List view of the same neighbourhood for keyboard, screen readers and mobile (default on phones).

### Coverage map (screen 03)
- Equal-size tile map per county **paired with** a ranked chart of 95% Wilson intervals and the
  national line. Never a choropleth alone.
- Mark only counties whose whole interval is off the national line (▲ / ▼).
- Expected = institutions × national rate per institution type (indirect standardisation).
- Selected-county panel with plain-language sentence and links to the county page and to
  "schools not yet involved".

---

## 9. Build phases

| Phase | Work | Deliverables | Done when |
|---|---|---|---|
| **0 Backbone** | load, normalise, resolve organisations, places, OIDs, registries; review loop; validation report | DuckDB + Parquet, review queue, quality report | regression checks pass; review queue cleared |
| **0b Crosswalks** | topic map 59→76; action levels; organisation-type crosswalk (EU types ↔ registry kinds) | `topic_map`, `type_map` | every project has ≥ 1 current-vocabulary topic |
| **1 Registry site** | organisation, project, place, country pages; search; coverage map | static site | Q1, 2, 4, 5, 11, 12 answerable in ≤ 3 clicks |
| **2 Extraction** | section split, schema extraction, canonicalisation, gold set | `concept` tables, precision report | precision acceptable in both periods |
| **3 Graph + explorer** | concept graph, PMI, Leiden, layouts, explorer UI, path finder | explorer | Q6–9 answerable |
| **4 Ask** | GraphRAG API, citations, refusal when evidence missing | Ask page | every answer cites projects; reference question set passes |
| **5 First project** | ladder analysis 2014–2026 (first KA2 action per org, next steps) | sector pages | Q3 answerable |

Phase 1 ships independently. Test each phase with 3–5 users from different audiences using the
questions in §1.

## 10. Risks and pitfalls

| Risk | Mitigation |
|---|---|
| Organisation matching takes longest | budget most of Phase 0 for it; review queue + stored decisions; English aliases list |
| University vs faculty confusion | faculties stay separate; parent recorded; never auto-merge HE units |
| Hairball graph | seeded start, node caps, hub exclusion, PMI weights |
| Hub concepts dominate paths | exclude by default; show toggle |
| Misleading money | three named measures; labels in titles; one-project skew noted (e.g. 26% of a county's coordinated money from one project) |
| Small-county extremes | intervals beside every map |
| LLM hallucination in extraction / Ask | evidence pointers, gold-set precision, citations required, "no evidence" answer allowed |
| Older summaries unsectioned | measure quality per period; stronger model for 2014–2020 if needed |
| Acronyms hide matches | expand during extraction |
| KA2-only scope makes KA1-active schools look inactive | scope stated on every page |
| Postcode ≠ municipality | add postcode → municipality table before municipality pages |
| Personal data in registries | organisational e-mails only; names never loaded |
| 2026 incomplete | "partial" marker on all trends |
| Stale data | "as of" dates; rebuild script; regression checks |
