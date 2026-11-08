# Erasmus+ Kompas

[Hrvatski](#hrvatski) · [English](#english) · [Developer guide / Upute za razvoj](app/README.md)

Public website on Croatian participation in Erasmus+ KA2 partnerships, 2014–2026 (3,830 projects with a Croatian participant, 1,498 Croatian organisations, 21 counties).
Javna web-stranica o hrvatskom sudjelovanju u Erasmus+ KA2 partnerstvima, 2014.–2026. (3.830 projekata s hrvatskim sudionikom, 1.498 hrvatskih organizacija, 21 županija).
Independent project; not an official site of the European Commission. / Neovisan projekt, nije službena stranica Europske komisije.

---

<a id="hrvatski"></a>
# Hrvatski

## 1. Tehnička arhitektura

Sve što web-stranica prikazuje izračunato je iz javnih datoteka. Ništa se ne unosi ručno, a adrese e-pošte i telefonski brojevi iz registara ne učitavaju se i ništa takvo se ne objavljuje.

```
 izvorne datoteke (CSV/XLSX)               lokalni jezični modeli (Ollama, izvanmrežni koraci)
 izvozi s Platforme za rezultate           Qwen 3.5 9B  -> pojmovi iz sažetaka projekata
 projekata programa Erasmus+               Gemma 4 31B  -> hrvatski nazivi pojmova i skupina
 tablice i registri s data.gov.hr          BGE-M3       -> ugrađeni vektori (pretraga po značenju, bliski duplikati)
          |                                         |
          v                                         |
 pipeline/ (numerirani koraci 00 ... 99)  <---------+
          |  jedna DuckDB datoteka: data/atlas.duckdb  (tablice, pogledi, mreža pojmova)
          |
          +--> 70_export_site.py --> JSON datoteke --> Astro 7 build --> site/dist  (statični HTML + JS + JSON)
          |                                                 |                        poslužuje nginx / bilo koji statični poslužitelj
          |                                                 +--> site/public/ek/ek.js + D.json (mehanizam stranica)
          |
          +--> atlas/  Ask API (FastAPI, POST /ask, POST /contact, GET /health)  <--- preglednik (ladica asistenta i stranica Pitaj)
```

**1. Obrada podataka (`app/pipeline/`, Python, DuckDB).** Numerirani koraci koji se mogu ponoviti.
- `00` učitava izvorne datoteke nepromijenjene u tablice `stg_*`; `05` izdvaja svaku hrvatsku organizaciju iz 100 partnerskih mjesta projekta (4.389 pojavljivanja); `07` poštanske brojeve pridružuje mjestima i županijama većinskim glasanjem.
- `10` prepoznaje hrvatske organizacije: oslonci su identifikatori organizacija (OID) iz nacionalne tablice 4 i registri škola i visokih učilišta, ostalo se povezuje približnim podudaranjem naziva unutar poštanskog broja (RapidFuzz); svaka odluka i svaki alias pohranjeni su u `app/data/review/` pa je rezultat ponovljiv.
- `30`/`35`/`40` grade preslikavanje tema 2014.–2020. → 2021.–2027. (pregledao vlasnik projekta), razrede organizacija, prijave po godinama te tablice i poglede koje stranica čita (`project`, `participation`, `v_county_ka2`, `v_coverage`, …).
- `50`–`52` (jezični modeli, izvan mreže, nekoliko sati): izdvajanje problema, ciljnih skupina, pristupa i rezultata iz sažetaka projekata uz dokazne citate; spajanje bliskih formulacija; hrvatski nazivi za 2.343 pojma. `60`/`61`: mreža pojmova (Leidenove zajednice, 24 skupine) i nazivi skupina. Izlaz modela je nacrt; hrvatski nazivi provjereni su prema terminologiji Vodiča kroz program (`app/data/review/`).
- `99` provodi 7 regresijskih provjera prema nacionalnim tablicama (na primjer zbrojevi po županijama).

**2. Web-stranica (`app/site/`, Astro 7, statična).** Hrvatske i engleske stranice iste strukture. Većinu stranica u pregledniku crta jedna skripta, `app/site/public/ek/ek.js`, izrađena iz dizajnerskog prototipa (`app/site/src/ek/*.js`, `app/site/tools/ek/build_ek.py`), a podatke dobiva iz `D.json` i po jedne male JSON datoteke za svaki projekt i organizaciju. Mreža pojmova i Metode izvorne su Astro stranice (raspored čvorova: d3-force). Svijetla i tamna tema, pristupačnost tipkovnicom, provjera alatom axe (WCAG 2 A/AA). `build_ek.py` mora se pokrenuti prije `astro build`; `build_site.sh` pokreće oboje.

**3. Asistent Pitaj (`app/atlas/`, FastAPI + LangGraph).** Pitanje prolazi kroz: prepoznavanje jezika → usmjerivač (mali model uz pravila po ključnim riječima koja pitanje mogu samo premjestiti na sigurniji ili određeniji put) → alati koji upituju DuckDB (organizacija, županija, grad, nacionalni pokazatelji, pokrivenost škola, partnerske države, godišnji niz, vrijednosti projekata, pretraga pojmova, …) → odgovor koji piše kôd iz rezultata alata (zadano) ili ga oblikuje model, a zatim se provjerava: svaki broj i izvor u tekstu mora potjecati iz rezultata alata, inače se koristi predloženi odgovor iz predloška. Pitanja izvan podataka odbijaju se. Ograničenja: 500 znakova, 20 pitanja u minuti po klijentu, red čekanja s vremenskim ograničenjem. Model radi na računalu vlasnika projekta; statična stranica radi i bez njega (tada odgovara iz podataka u pregledniku).

**Kontakt obrazac.** `POST /contact` (u `app/atlas/api.py`) dodaje svaku poruku kao jedan JSON redak u `app/data/contact_messages.jsonl` (datoteka nije u gitu: sadrži osobne podatke, a čita je samo vlasnik, način 600). Zapisuje se vrijeme, vrsta, jezik, stranica, poruka i neobvezna adresa e-pošte; adresa pošiljatelja (IP) koristi se samo za ograničenje broja poruka u memoriji (5 u 10 minuta) i ne sprema se, a tekst poruke ne ulazi u zapisnike. Skriveno polje za robote, ograničenje duljine (1.500 znakova) i veličine datoteke (5 MB). Čitanje: `python3 -m json.tool --json-lines app/data/contact_messages.jsonl`.

**4. Postavljanje (`app/deploy/`).** Statične datoteke iza nginxa (spremnik, stroga sigurnosna zaglavlja), lozinka i Cloudflare Tunnel za javnu demonstraciju; pojedinosti u `app/HOSTING.md`.

**5. Testovi.** 144 Python testa (`pytest`: pomoćne funkcije obrade, alati, usmjerivač, provjera odgovora, API) i 24 testa u pregledniku (Playwright: svaka stranica na hrvatskom i engleskom, svijetla i tamna tema, širina mobitela, pristupačnost, asistent, mreža pojmova).

## 2. Korišteni skupovi podataka

| # | Skup podataka | Izdavač | Poveznica | Za što se koristi |
|---|---|---|---|---|
| 1 | Platforma za rezultate projekata programa Erasmus+, izvozi za KA2: *Cooperation for innovation and the exchange of good practices* (2014.–2020.) i *Partnerships for cooperation and exchanges of practices* (2021.–2027.), izvezeno 27. 10. 2026. | Europska komisija, Erasmus+ | https://erasmus-plus.ec.europa.eu/projects/projects-lists | Svi KA2 projekti, partneri, države, bespovratna sredstva, sažetci (temeljni podaci) |
| 2 | *Program Erasmus+ za razdoblje od 2014. do 2020. godine*, tablice 1–5 (financirani projekti, financijski rezultati, prijave, jedinstvene organizacije korisnici s OID-om, projekti po županijama) | Agencija za mobilnost i programe EU (AMPEU) | https://data.gov.hr/ckan/dataset/968951ad-f697-471c-81b6-336c482a700c | Prepoznavanje hrvatskih organizacija, smještaj po županijama, prijave i uspješnost, provjera zbrojeva po županijama |
| 3 | *Program Erasmus+ za razdoblje od 2021. do 2027. godine*, tablice 7–9 (financirani projekti, financijski rezultati, prijave) | AMPEU, portal otvorenih podataka | https://data.gov.hr/ckan/hr/dataset/program-erasmus-za-razdoblje-od-2021-do-2027-godine | Isto, za 2021.–2027. |
| 4 | Registri obrazovnih ustanova: *Osnovne škole*, *Srednje škole*, *Dječji vrtići*, *Ustanove iz sustava visokog obrazovanja* (učitani bez imena ravnatelja, telefonskih brojeva i adresa e-pošte) | Ministarstvo znanosti, obrazovanja i mladih (MZOM), portal otvorenih podataka | Osnovne škole: https://data.gov.hr/ckan/hr/dataset/osnovne-skole · srednje škole: https://data.gov.hr/ckan/hr/dataset/srednje-skole · dječji vrtići: https://data.gov.hr/ckan/hr/dataset/djecji-vrtici · visoko obrazovanje: https://data.gov.hr/ckan/hr/dataset/ustanove-iz-sustava-visokog-obrazovanja | Povezivanje sudionika s ustanovama, udio škola koje sudjeluju po županijama |
| 5 | Vodič kroz program 2026. (HR), web-stranica AMPEU-a | Europska komisija; AMPEU | https://erasmus-plus.ec.europa.eu/programme-guide · https://www.ampeu.hr | Samo kao referenca: hrvatska terminologija (`app/data/review/`); podaci se ne preuzimaju |

Podaci nastali u ovom projektu (nisu vanjski skup podataka): odluke o organizacijama i aliasi, preslikavanje tema, nazivi pojmova i skupina (`app/data/review/*.csv`, u gitu), `app/data/atlas.duckdb` (gradi se obradom, nije u gitu). Izvorne datoteke nisu u gitu (veličina); kako ih nabaviti opisano je u [app/README.md](app/README.md#raw-data). Licencija svakog skupa podataka navedena je na njegovoj stranici (redovi 1–4); provjerite je ondje prije ponovne objave izvornih podataka.

## 3. Alati, biblioteke i AI alati s licencijama

**Jezici i okruženje:** Python 3.11/3.12 (licencija PSF), Node.js ≥ 22.23.4 (MIT), SQL u DuckDB-u.

| Alat | Namjena | Licencija |
|---|---|---|
| DuckDB 2.0 | baza podataka projekta | MIT |
| pandas, NumPy, PyArrow | obrada podataka | BSD-3-Clause, BSD-3-Clause, Apache-2.0 |
| RapidFuzz, Unidecode | približno podudaranje naziva, uklanjanje dijakritika | MIT, GPL-2.0-or-later |
| openpyxl, xlrd | čitanje XLSX / XLS | MIT, BSD |
| NetworkX, python-igraph, leidenalg | mreža pojmova, Leidenove zajednice | BSD-3-Clause, GPL-2.0-or-later, GPL-3.0-or-later |
| FastAPI, Uvicorn, Pydantic, pydantic-settings, httpx, PyYAML | API za Pitaj | MIT, BSD-3-Clause, MIT, MIT, BSD-3-Clause, MIT |
| LangChain, LangGraph, langchain-ollama, langchain-openai, ollama (Python klijent) | tijek Pitaj, pozivi modela | MIT |
| pytest | Python testovi | MIT |
| Astro 7 | statična web-stranica | MIT |
| d3-force 3 | raspored mreže pojmova | ISC |
| Playwright (Chromium), axe-core | testovi u pregledniku i pristupačnosti (samo razvoj) | Apache-2.0, MPL-2.0 |
| Source Sans 3, Source Serif 4 (fontovi na vlastitom poslužitelju, Adobe) | tipografija | SIL Open Font License 1.1 |
| Europa Component Library | slijedi se samo paleta boja i izgled; kôd ECL-a nije uključen | — |
| nginx, Docker | spremnik za postavljanje | BSD-2-Clause, Apache-2.0 |
| cloudflared (Cloudflare Tunnel) | javna adresa demonstracije | Apache-2.0 |
| Ollama | pokretanje lokalnih modela | MIT |

**AI modeli (svi rade lokalno preko Ollame; podaci ne napuštaju računalo):**

| Model | Namjena | Licencija |
|---|---|---|
| Qwen 3.5 9B (Q8) | izdvajanje pojmova iz sažetaka projekata (korak 50) | Apache-2.0 |
| Qwen3 4B Instruct 2507 (Q4_K_M) | usmjerivač pitanja asistenta (profil `qwen3_4b_2507`, zadan); oblikuje odgovore samo kad `ATLAS_ANSWER_MODE` nije `template` | Apache-2.0 |
| Gemma 4 31B (Q8) | hrvatski nazivi pojmova i skupina (koraci 52, 61); oblikovanje odgovora kad je taj način uključen | Apache-2.0 |
| BGE-M3 | višejezični ugrađeni vektori (pretraga po značenju, spajanje bliskih pojmova) | MIT |
| Qwen 3.5 4B, Qwen 2.5 7B Instruct | usmjerivači u alternativnim profilima `qwen35`, `gemma31b_q8`, `qwen25_7b` (`ATLAS_PROFILE=...`); testirani, nisu odabrani | Apache-2.0 |
| Qwen 2.5 3B Instruct | samo u starom profilu `light` (na računalu bez GPU-a zadan je isti Qwen3 4B kao i s GPU-om, profil `cpu`) | Qwen Research Licence (istraživačka uporaba) |

**AI asistent korišten u razvoju:** Claude Code (Anthropic) pomogao je pri pisanju i testiranju koda i dokumentacije te pri provjeri hrvatske terminologije; sve promjene pregledao je vlasnik projekta. Izlaz modela u podacima (pojmovi, hrvatski nazivi, nazivi skupina) smatra se nacrtom dok se ne pregleda.

**Licencija projekta.** Kôd ovog projekta objavljen je pod licencijom GNU General Public License, inačica 3 ili novija (GPL-3.0-or-later; datoteka `LICENSE`). Sve korištene biblioteke (MIT, BSD, Apache-2.0, ISC, GPL) kompatibilne su s GPL-om 3. Skupovi podataka i fontovi zadržavaju vlastite licencije navedene gore.

**Napomena o licencijama.** GPL biblioteke (Unidecode, python-igraph, leidenalg) koriste se u izvanmrežnoj obradi i nisu dio objavljene web-stranice; budući da je i sam projekt pod GPL-om 3 ili novijim, nema sukoba licencija. Modeli imaju vlastite licencije (tablica gore).

## Struktura repozitorija

| Mapa | Sadržaj |
|---|---|
| `app/` | cijela aplikacija: obrada podataka, Ask API, web-stranica, testovi, postavljanje; upute za razvoj u [app/README.md](app/README.md) |
| `EDA/` | istraživačka analiza podataka (skripte i izvješća) koja je prethodila izradi |
| `LICENSE` | GNU GPL 3 ili novija |


---

<a id="english"></a>
# English

## 1. Technical architecture

Everything the site shows is computed from public files. Nothing is typed in by hand, and e-mail addresses and phone numbers of the registers are not loaded and nothing of the kind is published.

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
          +--> atlas/  Ask API (FastAPI, POST /ask, POST /contact, GET /health)  <--- browser (assistant drawer and Ask page)
```

**1. Data pipeline (`app/pipeline/`, Python, DuckDB).** Numbered steps, each re-runnable.
- `00` loads the raw files unchanged into `stg_*` tables; `05` takes every Croatian organisation out of the 100 partner slots of a project (4,389 appearances); `07` maps postcodes to towns and counties by majority vote.
- `10` identifies the Croatian organisations: anchors are the organisation IDs (OID) of the national table 4 and the school/higher-education registers; the rest by fuzzy name matching inside a postcode (RapidFuzz); every decision and alias is stored in `app/data/review/` so the result is repeatable.
- `30`/`35`/`40` build the topic crosswalk 2014–2020 → 2021–2027 (reviewed by the owner), organisation classes, applications per year, and the tables and views the site reads (`project`, `participation`, `v_county_ka2`, `v_coverage`, …).
- `50`–`52` (language models, offline, hours): extraction of problems, target groups, approaches and outputs from project summaries with evidence quotes; merging of near-duplicate wordings; Croatian names for 2,343 concepts. `60`/`61`: concept graph (Leiden communities, 24 groups) and group names. Model output is a draft; Croatian wording was reviewed against the Programme Guide terminology (`app/data/review/`).
- `99` runs 7 regression checks against the national tables (for example the county totals).

**2. Site (`app/site/`, Astro 7, static).** Croatian and English pages with the same structure. Most pages are drawn in the browser by one script, `app/site/public/ek/ek.js`, built from the design prototype (`app/site/src/ek/*.js`, `app/site/tools/ek/build_ek.py`) and fed by `D.json` plus one small JSON per project and organisation. Concept network and Methods are native Astro pages (d3-force for the layout). Light and dark theme, keyboard access, checked with axe (WCAG 2 A/AA). `build_ek.py` has to run before `astro build`; `build_site.sh` does both.

**3. Ask assistant (`app/atlas/`, FastAPI + LangGraph).** A question goes through: language detection → router (small model plus keyword rules that only move a question to a safer or more specific route) → tools that query DuckDB (organisation, county, town, national figures, coverage of schools, partner countries, yearly series, project values, concept search, …) → answer written by code from the tool results (default) or phrased by the model and then checked: every number and source in the text must come from the tool results, otherwise the template answer is used. Questions outside the data are refused. Limits: 500 characters, 20 questions a minute per client, queue with timeout. The model runs on the owner's PC; the static site works without it (it then answers from the data in the browser).

**Contact form.** `POST /contact` (in `app/atlas/api.py`) appends each message as one JSON line to `app/data/contact_messages.jsonl` (not in git: it holds personal data, and only the owner can read it, mode 600). It records the time, kind, language, page, message and the optional e-mail address; the sender's address (IP) is used only for the in-memory rate limit (5 per 10 minutes) and is not stored, and the text of a message never goes into the logs. There is a hidden field for robots, a length limit (1,500 characters) and a file size limit (5 MB). To read the messages: `python3 -m json.tool --json-lines app/data/contact_messages.jsonl`.

**4. Hosting (`app/deploy/`).** Static files behind nginx (container, strict security headers), password and Cloudflare Tunnel for the public demo; details in `app/HOSTING.md`.

**5. Tests.** 144 Python tests (`pytest`: pipeline helpers, tools, router, verifier, API) and 24 browser tests (Playwright: every page in Croatian and English, light and dark, phone width, accessibility, assistant, graph).

## 2. Datasets used

| # | Dataset | Publisher | Link | Used for |
|---|---|---|---|---|
| 1 | Erasmus+ Project Results Platform, KA2 exports: *Cooperation for innovation and the exchange of good practices* (2014–2020) and *Partnerships for cooperation and exchanges of practices* (2021–2027), exported 2026-10-27 | European Commission, Erasmus+ | https://erasmus-plus.ec.europa.eu/projects/projects-lists | All KA2 projects, partners, countries, grants, summaries (the core data) |
| 2 | *Program Erasmus+ za razdoblje od 2014. do 2020. godine*, tables 1–5 (funded projects, financial results, applications, unique beneficiary organisations with OID, projects per county) | Agencija za mobilnost i programe EU (AMPEU), on the open data portal | https://data.gov.hr/ckan/dataset/968951ad-f697-471c-81b6-336c482a700c | Identifying Croatian organisations, county placement, applications and success rates, cross-check of county totals |
| 3 | *Program Erasmus+ za razdoblje od 2021. do 2027. godine*, tables 7–9 (funded projects, financial results, applications) | AMPEU, on the open data portal | https://data.gov.hr/ckan/hr/dataset/program-erasmus-za-razdoblje-od-2021-do-2027-godine | Same, for 2021–2027 |
| 4 | Registers of educational institutions: *Osnovne škole*, *Srednje škole*, *Dječji vrtići*, *Ustanove iz sustava visokog obrazovanja* (loaded without names of principals, phone numbers and e-mail addresses) | Ministarstvo znanosti, obrazovanja i mladih (MZOM), on the open data portal | Primary schools: https://data.gov.hr/ckan/hr/dataset/osnovne-skole · secondary schools: https://data.gov.hr/ckan/hr/dataset/srednje-skole · kindergartens: https://data.gov.hr/ckan/hr/dataset/djecji-vrtici · higher education: https://data.gov.hr/ckan/hr/dataset/ustanove-iz-sustava-visokog-obrazovanja | Matching participants to institutions, share of schools taking part per county |
| 5 | Programme Guide 2026 (HR), AMPEU website | European Commission; AMPEU | https://erasmus-plus.ec.europa.eu/programme-guide · https://www.ampeu.hr | Reference only: Croatian terminology (`app/data/review/`); no data taken |

Derived data made in this project (not an external dataset): organisation decisions and aliases, topic crosswalk, concept labels and group names (`app/data/review/*.csv`, committed), `app/data/atlas.duckdb` (rebuilt by the pipeline, not committed). The raw files are not in git (size); how to obtain them is in [app/README.md](app/README.md#raw-data). The licence of each dataset is stated on its page (rows 1–4); check it there before re-publishing the raw data.

## 3. Tools, libraries and AI tools, with licences

**Languages and runtime:** Python 3.11/3.12 (PSF licence), Node.js ≥ 22.23.4 (MIT), SQL in DuckDB.

| Tool | Use | Licence |
|---|---|---|
| DuckDB 2.0 | database of the project | MIT |
| pandas, NumPy, PyArrow | data handling | BSD-3-Clause, BSD-3-Clause, Apache-2.0 |
| RapidFuzz, Unidecode | fuzzy name matching, folding of diacritics | MIT, GPL-2.0-or-later |
| openpyxl, xlrd | reading XLSX / XLS | MIT, BSD |
| NetworkX, python-igraph, leidenalg | concept graph, Leiden communities | BSD-3-Clause, GPL-2.0-or-later, GPL-3.0-or-later |
| FastAPI, Uvicorn, Pydantic, pydantic-settings, httpx, PyYAML | Ask API | MIT, BSD-3-Clause, MIT, MIT, BSD-3-Clause, MIT |
| LangChain, LangGraph, langchain-ollama, langchain-openai, ollama (Python client) | Ask flow, model calls | MIT |
| pytest | Python tests | MIT |
| Astro 7 | static site | MIT |
| d3-force 3 | layout of the concept network | ISC |
| Playwright (Chromium), axe-core | browser and accessibility tests (development only) | Apache-2.0, MPL-2.0 |
| Source Sans 3, Source Serif 4 (self-hosted fonts, Adobe) | typography | SIL Open Font License 1.1 |
| Europa Component Library | only the colour palette and look were followed; no ECL code is included | — |
| nginx, Docker | container for hosting | BSD-2-Clause, Apache-2.0 |
| cloudflared (Cloudflare Tunnel) | public address of the demo | Apache-2.0 |
| Ollama | runs the local models | MIT |

**AI models (all run locally through Ollama; no data leaves the PC):**

| Model | Use | Licence |
|---|---|---|
| Qwen 3.5 9B (Q8) | extraction of concepts from project summaries (step 50) | Apache-2.0 |
| Qwen3 4B Instruct 2507 (Q4_K_M) | question router of the assistant (profile `qwen3_4b_2507`, the default); phrases answers only when `ATLAS_ANSWER_MODE` is not `template` | Apache-2.0 |
| Gemma 4 31B (Q8) | Croatian names of concepts and groups (steps 52, 61); phrasing of answers when that mode is on | Apache-2.0 |
| BGE-M3 | multilingual embeddings (meaning search, merging of near-duplicate concepts) | MIT |
| Qwen 3.5 4B, Qwen 2.5 7B Instruct | routers in the alternative profiles `qwen35`, `gemma31b_q8`, `qwen25_7b` (`ATLAS_PROFILE=...`); tested, not chosen | Apache-2.0 |
| Qwen 2.5 3B Instruct | only in the old `light` profile (on a machine without GPU the `cpu` profile now uses the same Qwen3 4B as the GPU default) | Qwen Research Licence (research use) |

**AI assistant used in development:** Claude Code (Anthropic) helped to write and test code and documentation and to review the Croatian terminology; all changes were reviewed by the project owner. Model output in the data (concepts, Croatian labels, group names) is marked as draft until reviewed.

**Licence of this project.** The code of this project is released under the GNU General Public License, version 3 or later (GPL-3.0-or-later; file `LICENSE`). All libraries used (MIT, BSD, Apache-2.0, ISC, GPL) are compatible with GPL 3. The datasets and fonts keep their own licences listed above.

**Note on licences.** The GPL libraries (Unidecode, python-igraph, leidenalg) are used in the offline pipeline and are not part of the published website; since the project itself is GPL-3.0-or-later, there is no licence conflict. The models have their own licences (table above).

## Repository layout

| Folder | Contents |
|---|---|
| `app/` | the whole application: data pipeline, Ask API, website, tests, deployment; developer guide in [app/README.md](app/README.md) |
| `EDA/` | exploratory data analysis (scripts and reports) that came before the build |
| `LICENSE` | GNU GPL 3 or later |

