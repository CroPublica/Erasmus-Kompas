#!/usr/bin/env python3
"""Turn a script into subtitles and scene data. Run from anywhere: python3 video/build.py [hr|en]

Writes subtitles_<lang>.srt, subtitles_<lang>.vtt and scenes/data.js (Croatian) or scenes/data_en.js (English). All figures are read from the app's data files, and the
build stops if a figure the script speaks no longer matches them. Timing is an estimate from syllables until a voice exists.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RATE = {"hr": 5.9, "en": 4.5}   # syllables per second, a brisk but normal narration (about 140 words per minute in the Croatian script)
COMMA, STOP, GAP = 0.18, 0.40, 0.75   # pauses in seconds: comma or colon, end of sentence, between sections
LEAD, TAIL = 1.0, 3.4                 # silence before the first word; end card after the last word
HOLD = {"ka2": 0.8}                # extra silent seconds after a section, so its slide can be read
MAX_LINE, MAX_SECONDS = 42, 178.0
LANG = sys.argv[1] if len(sys.argv) > 1 else "hr"

# Obvious slips corrected in the subtitles only; script_hr.md stays as written.
CORRECTIONS = {}
# Kept on one line or in one subtitle.
KEEP = ["dvije tisuće četrnaeste godine", "četrnaest i pol posto", "do gotovo pedeset sedam posto", "dvadeset dva projekta",
        "sto sedamdeset pet relevantnih projekata", "Erasmus+ Kompas", "Varaždinskoj županiji", "ciljane skupine",
        "rano napuštanje školovanja", "web-sjedište izrađeno", "jezični model", "jedna od tri", "Portala otvorenih podataka",
        "projektnih sažetaka", "Agencije za mobilnost i programe EU-a", "CSV, Excel ili PDF", "javni API",
        "uvid u to", "već sudjeluje", "alat za traženje partnera", "vodič za prvi projekt", "u bazu DuckDB", "alatu Astro", "u Pythonu"]
WEAK = {"u", "na", "s", "sa", "za", "o", "od", "do", "iz", "po", "k", "te", "i", "a", "ili", "ali", "se", "je", "su", "koji", "koje", "što",
        "tko", "kao", "ga", "ti", "ova", "ove", "više", "kad", "zato", "svojem", "svakoj", "njihovoj", "samim"}
SPOKEN = {"ka2": 2, "erasmus+": 4, "eu-a": 3, "csv": 3, "pdf": 3, "api": 3, "duckdb": 3, "python": 2, "pythonu": 3, "excel": 2, "astro": 2}
KEEP_EN = ["Erasmus+ Kompas", "Project Results Platform", "Open Data Portal", "Agency for Mobility and EU Programmes", "fourteen and a half per cent", "almost fifty-seven per cent",
           "Zagreb County", "Varaždin County", "twenty-two projects", "forty-two relevant projects", "CSV, Excel or PDF", "early school leaving", "DuckDB database", "public API",
           "“dropping out of school”,", "school dropout", "target groups", "KA2 partnerships", "Gimnazija Metković", "language model", "twenty fourteen", "key action", "good practice"]
WEAK_EN = {"the", "a", "an", "of", "in", "to", "for", "and", "or", "by", "with", "from", "who", "which", "that", "as", "is", "are", "at", "on", "into", "their", "these", "those", "how", "its", "has", "can", "not"}
SECTION_LABEL = {"What is KA2?": "ka2", "Overview": "pregled", "Map": "karta", "Organisations": "organizacije", "Concept network": "mreza", "Questions": "pitanja", "Što je KA2?": "ka2",
                 "Pregled": "pregled", "Mreža pojmova": "mreza", "Karta": "karta", "Organizacije": "organizacije", "Pitanja": "pitanja"}
SECTION_ID = {1: "problem", 2: "korisnici", 3: "izvori", 5: "arhitektura", 6: "vrijednost", 7: "razvoj"}


def syllables(word):
    w = re.sub(r"[„”.,:;?!()]", "", word.lower())
    if w in SPOKEN:
        return SPOKEN[w]
    if LANG == "en":
        w = re.sub(r"e$", "", w)
        return max(1, len(re.findall(r"[aeiouy]+", w)))
    n = len(re.findall(r"[aeiouô]", w)) + len(re.findall(r"(?<![aeiouô])r(?![aeiouô])", w))
    return max(1, n)


def parse_script(text):
    sections, group = [], None
    for raw in text.splitlines():
        line = raw.strip()
        if m := re.match(r"##\s+(\d+)\.\s+(.+)", line):
            group = (int(m[1]), m[2])
            if int(m[1]) != 4:
                sections.append({"id": SECTION_ID[int(m[1])], "group": m[2], "n": int(m[1]), "label": None, "text": ""})
        elif m := re.match(r"###\s+(.+)", line):
            sections.append({"id": SECTION_LABEL[m[1]], "group": group[1], "n": group[0], "label": m[1], "text": ""})
        elif line and not line.startswith("#"):
            sections[-1]["text"] += " " + line
    for s in sections:
        s["text"] = s["text"].strip()
        for a, b in CORRECTIONS.items():
            s["text"] = s["text"].replace(a, b)
    return sections


def protect(text):
    for k in (KEEP_EN if LANG == "en" else KEEP):
        text = text.replace(k, k.replace(" ", " "))
    return text


def weak_end(word):
    return word.replace(" ", " ").split(" ")[-1].lower() in (WEAK_EN if LANG == "en" else WEAK)


def clitic_start(word):
    return word.replace("\u00a0", " ").split(" ")[0].lower() in {"je", "se", "su", "ga"}


def plain_len(words):
    return len(" ".join(words))


def two_lines(words):
    if plain_len(words) <= MAX_LINE:
        return [words]
    best, best_cost = None, 1e9
    for i in range(1, len(words)):
        a, b = words[:i], words[i:]
        if plain_len(a) > MAX_LINE or plain_len(b) > MAX_LINE:
            continue
        cost = abs(plain_len(a) - plain_len(b)) + (60 if weak_end(a[-1]) else 0) + (60 if clitic_start(b[0]) else 0) - (14 if a[-1][-1] in ",:" else 0)
        if cost < best_cost:
            best, best_cost = [a, b], cost
    return best


def split_sentence(sentence):
    words = protect(sentence).split(" ")
    n = len(words)
    best = [(0.0, None)] + [(1e12, None)] * n
    for j in range(1, n + 1):
        for i in range(j):
            piece = words[i:j]
            if not two_lines(piece):
                continue
            cost = ((plain_len(piece) - 58) ** 2) / 300
            if plain_len(piece) < 24 and j - i < n:
                cost += 70
            if j < n:
                cost += 60 if weak_end(words[j - 1]) or clitic_start(words[j]) else 0
                cost -= 10 if words[j - 1][-1] in ",:" else 0
            total = best[i][0] + cost + 4
            if total < best[j][0]:
                best[j] = (total, i)
    out, j = [], n
    while j > 0:
        i = best[j][1]
        if i is None:
            raise SystemExit(f"Cannot split into subtitles: {sentence}")
        out.append(words[i:j])
        j = i
    return list(reversed(out))


def make_cues(sections):
    t, cues = LEAD, []
    for s in sections:
        s["start"] = round(t, 3)
        s["cues"] = []
        for sentence in re.findall(r".+?[.?!]+”?(?=\s|$)", s["text"]):
            sentence = sentence.strip()
            pieces = split_sentence(sentence)
            for k, piece in enumerate(pieces):
                lines = [" ".join(p).replace(" ", " ") for p in two_lines(piece)]
                text = " ".join(lines)
                dur = sum(syllables(w) for w in text.split(" ")) / RATE[LANG]
                dur = max(dur, 1.1)
                pause = STOP if k == len(pieces) - 1 else COMMA if text[-1] in ",:" else 0.05
                cue = {"start": round(t, 3), "end": round(t + dur, 3), "lines": lines, "text": text}
                cues.append(cue)
                s["cues"].append(cue)
                t += dur + pause
        s["end"] = round(t - STOP, 3)
        t += GAP + HOLD.get(s["id"], 0)
    return cues, round(sections[-1]["end"] + TAIL, 3)


def stamp(t, sep):
    ms = round(t * 1000)
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02}{sep}{ms % 1000:03}"


def figures():
    D = json.loads((ROOT / "app/site/public/ek/D.json").read_text(encoding="utf-8"))
    G = json.loads((ROOT / "app/site/src/data/graph.json").read_text(encoding="utf-8"))
    per = {}
    for period, role, county, kind, inst, part in D["coverage"]:
        if period == "all" and role == "any" and kind in ("primary", "secondary", "combined"):
            a = per.setdefault(county, [0, 0])
            a[0] += part
            a[1] += inst
    part, inst = sum(v[0] for v in per.values()), sum(v[1] for v in per.values())
    rates = sorted(per.items(), key=lambda kv: kv[1][0] / kv[1][1])
    orgs = json.loads((ROOT / "app/site/src/data/orgs.json").read_text(encoding="utf-8"))
    org = next(o for o in orgs if o["name"] == "Gimnazija Metković")
    group = next(c for c in G["communities"] if c["name"][1] == "Sprječavanje ranog napuštanja školovanja")
    node = next(n for n in G["nodes"] if n[3] == "rano napuštanje školovanja" and n[1] == "problem")
    county = next(c for c in D["counties"] if c["stem"] == org["county"])
    topic = next(n for n in G["nodes"] if n[0] == "TOP:Preventing early school leaving and failure in education")   # the Croatian Assistant scene shows this result (assets/screens/assistant_hr.png)
    checks = [(rates[0][0], "Zagrebačka"), (round(100 * rates[0][1][0] / rates[0][1][1], 1), 14.5), (rates[-1][0], "Varaždinska"),
              (round(100 * rates[-1][1][0] / rates[-1][1][1], 1), 56.9), (org["projects"], 22), (org["coordinated"], 1), (topic[4:7], [175, 153, 22])]
    bad = [c for c in checks if c[0] != c[1]]
    if bad or not 0.30 < part / inst < 0.36:
        raise SystemExit(f"The script no longer matches the data: {bad}, schools {part}/{inst}")
    en = LANG == "en"
    dropout = next(n for n in G["nodes"] if n[2] == "school dropout" and n[1] == "problem")   # the English Assistant scene shows this result (assets/screens/assistant_en.png)
    if en and dropout[4:7] != [5, 4, 1]:
        raise SystemExit(f"The English Assistant screenshot no longer matches the data: {dropout[4:7]}")
    county_en = {"Zagrebačka": "Zagreb County", "Varaždinska": "Varaždin County", "Dubrovačko-neretvanska": "Dubrovnik-Neretva County"}
    county_label = lambda stem: county_en[stem] if en else stem + " županija"
    return {
        "meta": {k: D["meta"][k] for k in ("projects", "organisations", "counties")}, "schools": [part, inst],
        "rates": {k: v for k, v in rates}, "lowest": rates[0][0], "highest": rates[-1][0], "geo": D["geo"],
        "lowest_label": county_label(rates[0][0]), "highest_label": county_label(rates[-1][0]), "org_county_label": county_label(org["county"]),
        "org": {k: org[k] for k in ("name", "town", "county", "projects", "coordinated", "p1", "p2")},
        "county": {"name": county_label(org["county"]) if en else county["label"], "organisations": county["ka2"]["all"]["organisations"], "projects": county["ka2"]["all"]["projects_involved"]},
        "group": {k: [x[0 if en else 1] for x in group[f"top_{k}"]] for k in ("problem", "approach", "target_group", "output")},
        "concept": {"name": node[2] if en else node[3]},
    }


def main():
    sections = parse_script((HERE / f"script_{LANG}.md").read_text(encoding="utf-8"))
    cues, duration = make_cues(sections)
    if duration > MAX_SECONDS:
        raise SystemExit(f"Too long: {duration:.1f} s (limit {MAX_SECONDS} s)")
    srt, vtt = [], ["WEBVTT", ""]
    for i, c in enumerate(cues, 1):
        body = "\n".join(c["lines"])
        srt += [str(i), f"{stamp(c['start'], ',')} --> {stamp(c['end'], ',')}", body, ""]
        vtt += [f"{stamp(c['start'], '.')} --> {stamp(c['end'], '.')}", body, ""]
    (HERE / f"subtitles_{LANG}.srt").write_text("\n".join(srt), encoding="utf-8")
    (HERE / f"subtitles_{LANG}.vtt").write_text("\n".join(vtt), encoding="utf-8")
    data = {"lang": LANG, "duration": duration, "sections": [{k: s[k] for k in ("id", "group", "n", "label", "start", "end", "cues")} for s in sections], "fig": figures()}
    (HERE / ("scenes/data.js" if LANG == "hr" else "scenes/data_en.js")).write_text("window.VIDEO=" + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    words = sum(len(s["text"].split()) for s in sections)
    print(f"{words} words, {len(cues)} subtitles, total {duration:.1f} s ({int(duration // 60)}:{int(duration % 60):02})")
    for s in sections:
        print(f"  {s['start']:6.1f}-{s['end']:6.1f}  {s['id']:13} {len(s['text'].split()):3} words")
    print("longest line:", max(len(l) for c in cues for l in c["lines"]), "| shortest cue:", round(min(c["end"] - c["start"] for c in cues), 2), "s | longest cue:", round(max(c["end"] - c["start"] for c in cues), 2), "s")


if __name__ == "__main__":
    main()
