# Erasmus+ Kompas

[Project documentation (PDF, in Croatian)](dokumentacija/CroPublica_Erasmus_Kompas_dokumentacija.pdf) · [Developer guide](app/README.md)

Data atlas of Croatian participation in Erasmus+ KA2 partnerships, 2014–2026 (3,830 projects with a Croatian participant, 1,498 Croatian organisations, 21 counties).

| | |
|---|---|
| Competition | Datathon Portala otvorenih podataka 2026. |
| Team | CroPublica |
| Members | Nikola Gamulin, Matea Vlašić |
| Team mentor | dr. sc. Gaurish Pandurang Thakkar, doc. |
| Institution | Sveučilište u Zagrebu, Filozofski fakultet |
| Public demo | https://southeast-migration-harvey-bibliographic.trycloudflare.com/en/ (password protected) |
| Repository | https://github.com/CroPublica/Erasmus-Kompas |

Independent project; not an official site of the European Commission.

---

## 1. Introduction

Erasmus+ Kompas is a data atlas that brings together information on Croatian participation in Erasmus+ KA2 partnerships from 2014 to 2026. Since 2014 only one in three Croatian primary and secondary schools has taken part in a KA2 partnership. Which schools are they, who do they work with, and what are their projects about? Why did more than half of the schools in Varaždin County take part, but only one in seven in Zagreb County? The answers exist but are scattered: the European Commission publishes project lists as tables with more than 600 columns, AMPEU publishes its own tables, and the Ministry of Science, Education and Youth publishes registers of educational institutions. Erasmus+ Kompas does that data work for the user.

KA2 is the Erasmus+ key action in which organisations from several countries work on projects together and exchange practice. Unlike individual mobility (KA1), its focus is cooperation between organisations and institutions. The atlas covers KA2 partnerships only, not Erasmus+ as a whole.

| Users | Features they may find useful |
|---|---|
| Schools, associations, towns and municipalities | search by organisation name |
| Citizens and journalists | Map and ranking, county pages, Assistant |
| Counties, AMPEU and ministries | School coverage, Topics over time, Compare counties |
| Researchers | Concept network, What projects do, Downloads |

Every figure is computed from public files. Nothing is typed in by hand, and the registers are loaded without names of principals, phone numbers and e-mail addresses.

## 2. Features

The menu has six sections.

| Section | Pages |
|---|---|
| Overview | Key figures, Over time, Partner countries |
| Counties | Map and ranking, Compare counties, School coverage, a page for every county |
| Topics and problems | Topics over time, Problems and solutions, Concept network, What projects do |
| Projects and organisations | Projects and Organisations with filters, a page for every project and organisation |
| Assistant | Assistant page and a drawer available on every page |
| Information | About the data, Glossary, Downloads |

- **Overview.** Key figures by county, sector and project type; projects per call year; the countries Croatia has worked with.
- **Counties.** Projects, coordinators, organisations and total project value per county, filterable by period. Compare up to four counties. School coverage: the share of primary and secondary schools in each county that took part in at least one KA2 partnership, filterable by institution type, period and role.
- **Topics and problems.** Share of projects with a chosen topic per call year. The EU replaced its topic list in 2021, so only the 18 topics that kept their name can be followed across the whole period. Problems and solutions: pick a problem and see the approaches, target groups and outputs linked to it. The concept network shows the concepts a language model extracted from project summaries.
- **Projects and organisations.** Search and filters (period, sector, type, partner country, status). Project page: summary, Croatian participants, countries, topics, network concepts, similar projects, links to EU sources. Organisation page (all 1,498): projects, role, partner countries, topics. Lists can be downloaded as CSV, Excel or PDF.
- **Assistant.** Questions in Croatian or English about organisations, counties, school coverage, national totals, application success, concepts and projects. Asked about "early school leaving", it recognises the topic of that name and finds 175 projects; the answer gives examples and sources. It answers only questions the data can answer.
- **Information.** Description of the data and sources, glossary, and downloads of the datasets the atlas is built on.

**Accessibility, language and look.** The interface follows WCAG 2.1 level AA: keyboard use, no information conveyed by colour alone, layout adapts to phones. The atlas has Croatian and English versions and light and dark themes. Since part of the data is in English, English is the main interface language. The Croatian version was machine-translated with AI and may contain wrong terms, grammar and spelling errors and unnatural phrasing; a full edit is planned, and until then the English interface is recommended.

## 3. Technical architecture

Data is processed in Python and stored in DuckDB, from which a static site is generated with Astro.

```
 raw files (CSV/XLSX)                      local language models (Ollama, offline steps)
 EU Project Results Platform exports       Qwen 3.5 9B  -> concepts from project summaries
 data.gov.hr tables and registers          Gemma 4 31B  -> Croatian names of concepts and groups
          |                                BGE-M3       -> embeddings (meaning search, near-duplicates)
          v                                         |
 pipeline/ (numbered steps 00 ... 99)  <-----------+
          |  one DuckDB file: data/atlas.duckdb  (tables, views, concept graph)
          |
          +--> 70_export_site.py --> JSON files --> Astro 7 build --> site/dist  (static HTML + JS + JSON)
          |                                                 |                       served by nginx / any static host
          |                                                 +--> site/public/ek/ek.js + D.json (page engine)
          |
          +--> atlas/  Assistant API (FastAPI, POST /ask, POST /contact, GET /health)  <--- browser (assistant drawer and page)
                       Qwen3 4B routes the question, code builds the answer
```

| Part | Tools and technologies |
|---|---|
| Data processing | Python 3.11 and 3.12, DuckDB 2.0, pandas, NumPy, PyArrow, RapidFuzz, openpyxl |
| Concept network | NetworkX, python-igraph, leidenalg |
| Language models | Ollama, Qwen, Gemma, BGE-M3 |
| Site | Astro 7, d3-force, own script for the interactive views (`ek.js`), Source Sans 3 and Source Serif 4 fonts |
| Assistant | FastAPI, Uvicorn, Pydantic, LangGraph, LangChain |
| Hosting | Docker, nginx, Cloudflare Tunnel, systemd |
| Testing | pytest, Playwright, axe-core |

**3.1 Data pipeline (`app/pipeline/`).** Numbered steps, each re-runnable.
- `00` loads the raw files unchanged into `stg_*` tables; `05` takes every Croatian organisation out of the 100 partner slots of a project (4,389 appearances); `07` maps postcodes to towns and counties by majority vote.
- `10` identifies the Croatian organisations: anchors are the organisation IDs (OID) of the national table 4 and the school and higher-education registers; the rest by fuzzy name matching inside a postcode (RapidFuzz). Every decision and alias is stored in `app/data/review/`, so the result is repeatable.
- `30`/`35`/`40` map the topics of the two periods to one list (reviewed by the owner) and build organisation classes, applications per year, and the tables and views the site reads.
- `50`–`52` and `60`/`61`: language-model steps (see 3.2). They take hours and are run separately.
- `70` exports the JSON files for the site; `99` runs regression checks against the national source tables (for example the county totals).

**3.2 Language models.** All models run locally through Ollama, so no data leaves the machine that processes it. Each model has one job.

| Model | Job | Scope |
|---|---|---|
| Qwen 3.5 9B (Q8) | extraction of problems, approaches, target groups and outputs from summaries (step 50) | 113,850 items from 3,795 projects, about 11 hours |
| BGE-M3 | merging similar wordings (step 51) and semantic search | extracted concepts and user questions |
| Gemma 4 31B (Q8) | Croatian names of concepts and groups (steps 52, 61) | 2,343 concepts that occur in at least three projects |
| Qwen3 4B Instruct 2507 (Q4_K_M) | routing questions in the Assistant | every question |

For each summary the model returns JSON with problems, target groups, approaches and outputs, and gives a verbatim quote from the summary for each problem, approach and output. If the quote is not in the text, the item is flagged as suspect.

Three models were tried for extraction. Eight projects were labelled by hand and each model's recall (share of hand-labelled items the model found) was measured:

| Model | Problems | Approaches | Outputs | Target groups | Seconds per project |
|---|---|---|---|---|---|
| **Qwen 3.5 9B** | 86 % | 97 % | 96 % | 84 % | 13.6 |
| Gemma 4 8B | 76 % | 78 % | 93 % | 100 % | 10.8 |
| Gemma 4 31B | 90 % | 81 % | 86 % | 0 % | about 25 |

Qwen 3.5 9B was chosen because it finds approaches and outputs best. Similar wordings are merged with BGE-M3 only when their cosine similarity is at least 0.80. The Croatian names of concepts and groups were proposed by Gemma 4 31B and count as drafts until reviewed by hand.

**3.3 Concept network.** Nodes are EU topics and concepts that occur in at least five projects. Two nodes are linked when they occur together in at least three projects and at least twice as often as chance would give. The Leiden algorithm splits 1,231 nodes and 7,830 links into 24 groups; the 19 groups with at least 20 projects are shown on the site. A link only means the concepts occur in the same projects, not that one causes the other.

**3.4 Site (`app/site/`).** Astro 7 generates static pages in Croatian and English; most interactive views are drawn by `app/site/public/ek/ek.js` from JSON files (`D.json` plus one small file per project and organisation). The site therefore runs on any static file server. `build_site.sh` runs the export (step 70), `build_ek.py` and `astro build`.

**3.5 Assistant (`app/atlas/`).** The Assistant's language model (Qwen3 4B) only sorts the question into one of 19 types and pulls details such as an organisation or county name out of it; the program then checks those details. Read-only tools fetch the data from the database, and the program writes the answer from a predefined template. Steps: language detection → routing (model) → tools (read DuckDB) → answer (program fills the template) → check (only when the model writes the answer) → answer with sources.

The Assistant API listens only on the machine it runs on (browsers reach it through nginx at `/api/`) and does not store questions. A question may be at most 500 characters, and one client may ask at most 20 questions a minute. The model never sees project summaries, only the data the tools returned. When the mode in which the model phrases the answer is on (`ATLAS_ANSWER_MODE`), every number and source in the text must come from the tool results, otherwise the template answer is used.

**Contact form.** `POST /contact` (in `app/atlas/api.py`) appends each message as one JSON line to `app/data/contact_messages.jsonl` (not in git: it holds personal data, and only the owner can read it, mode 600). It records the time, kind, language, page, message and the optional e-mail address; the sender's address (IP) is used only for the in-memory rate limit (5 per 10 minutes) and is not stored, and the text of a message never goes into the logs. There is a hidden field for robots, a length limit (1,500 characters) and a file size limit (5 MB). To read the messages: `python3 -m json.tool --json-lines app/data/contact_messages.jsonl`.

**3.6 Hosting (`app/deploy/`).** nginx serves the static files from a Docker container and sends HTTP security headers with every page that let the browser load content only from the same site and forbid embedding the page in other sites. The public demo runs through Cloudflare Tunnel and is password protected. Models are chosen in `app/config/models.yaml`, so they can be swapped without code changes. Details in `app/HOSTING.md`.

**3.7 Tests.** 185 Python tests (`pytest`: pipeline helpers, tools, router, verifier, API) and 34 browser tests (Playwright: every page in Croatian and English, light and dark, phone width, accessibility with axe-core, assistant, graph).

## 4. User value, further development and limitations

Schools can see which institutions in their county already take part in projects and what those projects are about; citizens, journalists and researchers can easily find out which organisations from their area take part in KA2 partnerships.

**Planned work:**
- a partner finder suggesting institutions and associations in other European countries that work on similar problems with similar approaches;
- a first-project guide showing, per sector, what a typical first project looks like, the usual grant and the share of successful applications;
- yearly data updates;
- a documented API next to the existing dataset downloads.

**Limitations:**
- Concepts extracted by the language models are split into many similar wordings, and only a small part of their Croatian names has been reviewed by hand.
- The total project value of €952.7 million is not the amount Croatia received; it includes the grants of foreign partners.
- The Assistant runs on a local machine for now; the static site works without it.
- Accessibility has been checked with automated tools only.
- The Croatian interface was machine-translated and awaits editing.

## 5. Data sources

| # | Source | Publisher | Used for |
|---|---|---|---|
| 1 | Erasmus+ Project Results Platform, KA2 exports (2014–2020 and 2021–2027), exported 2026-10-27 | European Commission | all KA2 projects, partners, countries, grants and summaries (the core data) |
| 2 | *Program Erasmus+ za razdoblje od 2014. do 2020. godine*, tables 1–5 | AMPEU | identifying organisations (OID), county placement, applications and success rates, cross-checking totals |
| 3 | *Program Erasmus+ za razdoblje od 2021. do 2027. godine*, tables 7–9 | AMPEU | funded projects, finances and applications for the newer period |
| 4 | Registers: primary schools, secondary schools, kindergartens, higher-education institutions | Ministry of Science, Education and Youth | matching participants to institutions, school coverage per county |
| 5 | Erasmus+ Programme Guide 2026 | European Commission | Croatian terminology only (`app/data/review/`); no data taken |

The datasets from the Open Data Portal (rows 2–4) are published under the Open Licence (Otvorena dozvola). The raw files are not in git (size); how to obtain them is in [app/README.md](app/README.md#raw-data). Derived data made in this project: organisation decisions and aliases, topic crosswalk, concept and group names (`app/data/review/*.csv`, committed) and `app/data/atlas.duckdb` (rebuilt by the pipeline, not committed).

References (APA, 7th edition):

- Agencija za mobilnost i programe Europske unije. (2026a). *Program Erasmus+ za razdoblje od 2014. do 2020. godine* [Erasmus+ programme 2014–2020] [Data set]. Open Data Portal. https://data.gov.hr/ckan/hr/dataset/program-erasmus-za-razdoblje-od-2014-do-2020-godine
- Agencija za mobilnost i programe Europske unije. (2026b). *Program Erasmus+ za razdoblje od 2021. do 2027. godine* [Erasmus+ programme 2021–2027] [Data set]. Open Data Portal. https://data.gov.hr/ckan/hr/dataset/program-erasmus-za-razdoblje-od-2021-do-2027-godine
- European Commission. (2025). *Erasmus+ programme guide 2026* (Version 1, 12 November 2025). https://erasmus-plus.ec.europa.eu/document/erasmus-programme-guide-2026
- European Commission. (2026a). *Cooperation for innovation and the exchange of good practices: Projects overview* [Data set; KA2, 2014–2020]. Erasmus+ Project Results Platform. https://erasmus-plus.ec.europa.eu/projects/projects-lists
- European Commission. (2026b). *Partnerships for cooperation and exchanges of practices: Projects overview* [Data set; KA2, 2021–2027]. Erasmus+ Project Results Platform. https://erasmus-plus.ec.europa.eu/projects/projects-lists
- Ministarstvo znanosti, obrazovanja i mladih. (2026a). *Dječji vrtići* [Kindergartens] [Data set]. Open Data Portal. https://data.gov.hr/ckan/hr/dataset/djecji-vrtici
- Ministarstvo znanosti, obrazovanja i mladih. (2026b). *Osnovne škole* [Primary schools] [Data set]. Open Data Portal. https://data.gov.hr/ckan/hr/dataset/osnovne-skole
- Ministarstvo znanosti, obrazovanja i mladih. (2026c). *Srednje škole* [Secondary schools] [Data set]. Open Data Portal. https://data.gov.hr/ckan/hr/dataset/srednje-skole
- Ministarstvo znanosti, obrazovanja i mladih. (2026d). *Ustanove iz sustava visokog obrazovanja* [Higher-education institutions] [Data set]. Open Data Portal. https://data.gov.hr/ckan/hr/dataset/ustanove-iz-sustava-visokog-obrazovanja

## 6. Tools, libraries and AI tools, with licences

**Languages and runtime:** Python 3.11/3.12 (PSF licence), Node.js ≥ 22.23.4 (MIT), SQL in DuckDB.

| Tool | Use | Licence |
|---|---|---|
| DuckDB 2.0 | database of the project | MIT |
| pandas, NumPy, PyArrow | data handling | BSD-3-Clause, BSD-3-Clause, Apache-2.0 |
| RapidFuzz, Unidecode | fuzzy name matching, folding of diacritics | MIT, GPL-2.0-or-later |
| openpyxl, xlrd | reading XLSX / XLS | MIT, BSD |
| NetworkX, python-igraph, leidenalg | concept graph, Leiden communities | BSD-3-Clause, GPL-2.0-or-later, GPL-3.0-or-later |
| FastAPI, Uvicorn, Pydantic, pydantic-settings, httpx, PyYAML | Assistant API | MIT, BSD-3-Clause, MIT, MIT, BSD-3-Clause, MIT |
| LangChain, LangGraph, langchain-ollama, langchain-openai, ollama (Python client) | Assistant flow, model calls | MIT |
| pytest | Python tests | MIT |
| Astro 7 | static site | MIT |
| d3-force 3 | layout of the concept network | ISC |
| Playwright (Chromium), axe-core | browser and accessibility tests (development only) | Apache-2.0, MPL-2.0 |
| Source Sans 3, Source Serif 4 (self-hosted fonts, Adobe) | typography | SIL Open Font License 1.1 |
| Europa Component Library | only the colour palette and look were followed; no ECL code is included | — |
| nginx, Docker | container for hosting | BSD-2-Clause, Apache-2.0 |
| cloudflared (Cloudflare Tunnel) | public address of the demo | Apache-2.0 |
| systemd | starting the services at boot | LGPL-2.1-or-later |
| Ollama | runs the local models | MIT |

**AI models** (all run locally through Ollama; their jobs are in the table in 3.2):

| Model | Licence |
|---|---|
| Qwen 3.5 9B, Qwen3 4B Instruct 2507 | Apache-2.0 |
| Gemma 4 31B, Gemma 4 8B (compared for extraction; extraction model of the other profiles) | Apache-2.0 |
| BGE-M3 | MIT |
| Qwen 3.5 4B, Qwen 2.5 7B Instruct (alternative profiles in `app/config/models.yaml`; tested, not chosen) | Apache-2.0 |
| Qwen 2.5 3B Instruct (old `light` profile only) | Qwen Research Licence (research use) |

**AI assistant used in development:** Claude Code (Anthropic) helped to write and test code and documentation and to review the Croatian terminology; all changes were reviewed by hand. Model output in the data (concepts, Croatian names, group names) counts as a draft until reviewed.

**Licence of this project.** The code is released under the GNU General Public License, version 3 or later (GPL-3.0-or-later; file `LICENSE`). All libraries used (MIT, BSD, Apache-2.0, ISC, GPL) are compatible with GPL 3. The GPL libraries (Unidecode, python-igraph, leidenalg) are used in the offline pipeline and are not part of the published site. Datasets, fonts and models keep their own licences.

## Repository layout

| Folder | Contents |
|---|---|
| `app/` | the whole application: data pipeline, Assistant API, site, tests, deployment; developer guide in [app/README.md](app/README.md) |
| `dokumentacija/` | project documentation for the Datathon (PDF and DOCX) and figures |
| `EDA/` | exploratory data analysis (scripts and reports) that came before the build |
| `video/` | video presentation of the project |
| `LICENSE` | GNU GPL 3 or later |
