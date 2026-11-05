# Translation review 2026-11-04: what is still open

Source: Erasmus-Kompas_translation_review_2026-11-04_checked.xlsx. Everything marked `changed` was applied; the items below were not.

## 1. Croatian page text in the prototype code (sheet Dictionary HR-EN, status `to check`)

The Croatian is in `site/src/ek/*.js` and the dictionary keys in `site/tools/ek/i18n/d_*.py`; both have to change together, then `python3 tools/ek/i18n/gen.py` (output goes to tools/ek/, copy to src/ek/), `build_ek.py`, `astro build`.

- row 73: `Brojke, godišnji graf i poredak uz filtre.` -> `Brojke, godišnji grafikon i poredak uz filtre.`  (Croatian: chart = grafikon)
- row 113: `Erasmus+ Project Results Platform` -> `Platforma za rezultate projekata programa Erasmus+`  (Programme Guide 2026 (HR): official Croatian name; the Croatian page shows the English name)
- row 141: `KA{N} partnerstva. KA{N} mobilnosti nisu uključene.` -> `KA{N} partnerstva. Mobilnost u okviru KA{N} nije uključena.`  ("KA1 mobilnosti" is unidiomatic)
- row 153: `Brojke, godišnji graf i poredak uz filtre` -> `Brojke, godišnji grafikon i poredak uz filtre`  (Croatian: chart = grafikon)
- row 161: `otvori popis s filterom` -> `otvori popis s filtrom`  (standard form: filtar, filtri)
- row 169: `Filteri` -> `Filtri`  (standard form: filtar, filtri)
- row 182: `{N} redaka prema trenutnim filterima` -> `{N} redaka prema trenutnim filtrima`  (standard form: filtar, filtri)
- row 206: `Ukloni filter: {E}` -> `Ukloni filtar: {E}`  (standard form: filtar, filtri)
- row 207: `Ukloni filter` -> `Ukloni filtar`  (standard form: filtar, filtri)
- row 214: `KA{N} projekata s sudionikom iz županije` -> `KA{N} projekata sa sudionikom iz županije`  ("sa" before s-)
- row 216: `Godišnji prikaz trenutno je dostupan samo za cijelu Hrvatsku. Poništite filter županije.` -> `Godišnji prikaz trenutno je dostupan samo za cijelu Hrvatsku. Poništite filtar županije.`  (standard form: filtar, filtri)
- row 311: `Grantovi: €{N}M` -> `Bespovratna sredstva: {N} mil. €`  (Programme Guide 2026 (HR): grant = bespovratna sredstva)
- row 363: `Slabe` -> `Opadaju`  ("slabe" means "are weak"; "opadaju" means "are declining")
- row 373: `slabi` -> `opada`  ("slabi" means "is weak")
- row 413: `Ukloni filter: {N}–{N}` -> `Ukloni filtar: {N}–{N}`  (standard form: filtar, filtri)
- row 423: `VET` -> `SOO`  (Programme Guide 2026 (HR): Croatian abbreviation of VET is SOO)
- row 429: `, koja se generira u pipelineu i nije u ovom prototipu. Prikazani su podaci koji postoje u popisu projekata.` -> `, koja se generira pri obradi podataka i nije u ovom prototipu. Prikazani su podaci koji postoje u popisu projekata.`  (anglicism)
- row 456: `Grantovi, dobra praksa` -> `Bespovratna sredstva, dobra praksa`  (Programme Guide 2026 (HR): grant = bespovratna sredstva)
- row 460: `, koji se generira u pipelineu. Ispod je raspored; pun primjer vidi se na organizaciji „Gimnazija Metković”.` -> `, koji se generira pri obradi podataka. Ispod je raspored; pun primjer vidi se na organizaciji „Gimnazija Metković”.`  (anglicism)
- row 498: `Samo KA{N} projekte. KA{N} mobilnosti nisu uključene.` -> `Samo KA{N} projekte. Mobilnost u okviru KA{N} nije uključena.`  ("KA1 mobilnosti" is unidiomatic)
- row 500: `Iznosi su okvirne potpore dodijeljene pri odabiru. Bilježe se po projektu i nisu podijeljeni među partnere.` -> `Iznosi su okvirna bespovratna sredstva dodijeljena pri odabiru. Bilježe se po projektu i nisu podijeljeni među partnere.`  (Programme Guide 2026 (HR): grant = bespovratna sredstva)
- row 513: `Ključne aktivnosti programa Erasmus+. KA{N} su mobilnosti pojedinaca (učenje u inozemstvu), a KA{N} suradnja organizacija i razmjena dobrih praksi kroz partnerstva. Ovaj atlas prikazuje samo KA{N}.` -> `Ključne aktivnosti programa Erasmus+. KA{N} je mobilnost u svrhu učenja za pojedince, a KA{N} suradnja organizacija i institucija kroz partnerstva. Ovaj atlas prikazuje samo KA{N}.`  (Programme Guide 2026 (HR): official Key Action names)
- row 519: `Organizacija koja podnosi prijavu, vodi projekt i prima grant. {E} je koordinator kada je vodeća organizacija iz Hrvatske.` -> `Organizacija koja podnosi prijavu, vodi projekt i prima bespovratna sredstva. {E} je koordinator kada je vodeća organizacija iz Hrvatske.`  (Programme Guide 2026 (HR) glossary (Koordinator))
- row 523: `Dva višegodišnja financijska okvira programa: {N}–{N} i {N}–{N} Popisi tema i vrste projekata razlikuju se između njih, pa se neki grafovi ne spajaju preko {N}.` -> `Dva višegodišnja financijska okvira programa: {N}–{N} i {N}–{N} Popisi tema i vrste projekata razlikuju se između njih, pa se neki grafikoni ne spajaju preko {N}.`  (Croatian: chart = grafikon)
- row 524: `Godina natječaja na kojem je projekt odabran. Godina {N}. još traje, pa je u grafovima prikazana kao nepotpuna.` -> `Godina poziva na podnošenje prijedloga u kojem je projekt odabran. Godina {N}. još traje, pa je u grafikonima prikazana kao nepotpuna.`  (Programme Guide 2026 (HR) glossary: Poziv na podnošenje prijedloga)
- row 526: `Okvirni iznos potpore dodijeljen projektu pri odabiru. Bilježi se po projektu i ne dijeli se među partnere.` -> `Okvirni iznos bespovratnih sredstava dodijeljen projektu pri odabiru. Bilježi se po projektu i ne dijeli se među partnere.`  (Programme Guide 2026 (HR): grant = bespovratna sredstva)
- row 545: `Navedite izvor: Erasmus+ Project Results Platform, Agencija za mobilnost i programe EU, Ministarstvo znanosti i obrazovanja.` -> `Navedite izvor: Platforma za rezultate projekata programa Erasmus+, Agencija za mobilnost i programe EU, Ministarstvo znanosti i obrazovanja.`  (Programme Guide 2026 (HR): official Croatian name)
- row 561: `Svaki graf ima tekstualni ekvivalent: brojke uz stupce, popis ili tablicu podataka.` -> `Svaki grafikon ima tekstualni ekvivalent: brojke uz stupce, popis ili tablicu podataka.`  (Croatian: chart = grafikon)
- row 622: `redaka prema trenutnim filterima` -> `redaka prema trenutnim filtrima`  (standard form: filtar, filtri)
- row 625: `Primijenjeni filteri` -> `Primijenjeni filtri`  (standard form: filtar, filtri)
- row 663: `Grantovi: {N} mil. €` -> `Bespovratna sredstva: {N} mil. €`  (Programme Guide 2026 (HR): grant = bespovratna sredstva)
- row 718: `Grantovi koordiniranih projekata` -> `Bespovratna sredstva koordiniranih projekata`  (Programme Guide 2026 (HR): grant = bespovratna sredstva)
- row 749: `Navedite izvore: Erasmus+ Project Results Platform (Europska komisija), Program Erasmus+ {N}.–{N}. i registri ustanova na data.gov.hr (Agencija za mobilnost i programe EU, Ministarstvo znanosti i obrazovanja).` -> `Navedite izvore: Platforma za rezultate projekata programa Erasmus+ (Europska komisija), Program Erasmus+ {N}.–{N}. i registri ustanova na data.gov.hr (Agencija za mobilnost i programe EU, Ministarstvo znanosti i obrazovanja).`  (Programme Guide 2026 (HR): official Croatian name)
- row 760: `Navedite izvore: Erasmus+ Project Results Platform (Europska komisija), Program Erasmus+ {N}–{N} i registri ustanova na data.gov.hr (Agencija za mobilnost i programe EU, Ministarstvo znanosti i obrazovanja).` -> `Navedite izvore: Platforma za rezultate projekata programa Erasmus+ (Europska komisija), Program Erasmus+ {N}–{N} i registri ustanova na data.gov.hr (Agencija za mobilnost i programe EU, Ministarstvo znanosti i obrazovanja).`  (Programme Guide 2026 (HR): official Croatian name)
- row 768: `Inkluzija i jednakost` -> `Uključivost i jednakost`  (Programme Guide 2026 (HR): uključivost (inclusion priority))
- row 775: `↘ Najviše slabe` -> `↘ Najviše opadaju`  ("slabe" means "are weak")
- row 816: `↘ slabi` -> `↘ opada`  ("slabi" means "is weak")

## 2. Other open rows

- Dictionary row 247 (`Prikaži još (-{N})` -> `Prikaži manje`): not applied. The only place in the code is `Prikaži još (${list.length - shown})` in views2.js, which shows a positive remaining count, so it does not look like a bug. Check what the original text is on the page.
- Counties and countries: `eurozona` -> `europodručje`, `Guadalupe` -> `Guadeloupe`, `Kanari` -> `Kanarski otoci` (Croatian names in countries-hr.json / the page source), and removing the two rows `pseudo naglasci`, `pseudo bidi` (not countries).
- Concept labels, 7 `students` rows left on the draft because the data does not decide: app00519, tar01486, app05318, tar00645, tar03525 (mixed school / higher-education projects), app00651, app04897 (mostly higher education, so `studenti` is right). The other 45 were set to `učenici` (school organisations in most of their projects).
- Concept labels that still use words from the Avoid column of the Terminology sheet: app00073 `vršnjačka edukacija`, tar00622 `mladi vršnjački edukatori` (edukacija/edukator); tar00091 `treneri` is fine for sport coaches. `odgojitelji` (tar00210, tar00217, tar00796) is correct: pre-primary teachers only.
- 128 Croatian labels are used by more than one concept (for example `mladi` for young people / youth / youngsters). That is the synonym question, not a translation error.

## 3. To run on the PC that holds the database (not done here because it writes atlas.duckdb and Node is not installed in this shell)

1. Stop the demo (`deploy/public_demo.sh stop`).
2. `python pipeline/52_label_concepts_hr.py --load-only` and `python pipeline/61_name_communities.py --load-only` (reviewed wording goes into the tables concept_label and community_name).
3. `./build_site.sh --test`, then `deploy/public_demo.sh restart`.
