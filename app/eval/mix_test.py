"""Language-mixing test of the Ask answers: hundreds of generated and hand-written questions, in Croatian and English, and a check of
every answer for words of the other language that are not part of a proper name.

  python eval/mix_test.py                    run, print a summary and the worst answers, write eval/results/mix_test.json
  python eval/mix_test.py --show 40          print more examples
  python eval/mix_test.py --only concepts    only one group (orgs, counties, national, concepts, projects, mixed, en)

What counts as a leak: in a Croatian answer, English words (function words such as 'the', 'of', 'and', or words found only in English concept
names); in an English answer, Croatian words or letters with Croatian diacritics. Text inside quotation marks or brackets that is the original
title of a project or the name of an organisation is not counted: those are names, not wording of the answer.
"""
import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "pipeline"))
import duckdb  # noqa: E402

from atlas.ask import Asker  # noqa: E402
from atlas.tools import DB_PATH  # noqa: E402

EN_FUNCTION = {"the", "of", "and", "with", "for", "from", "are", "was", "were", "which", "that", "this", "these", "those", "among", "between",
               "their", "its", "has", "have", "had", "been", "not", "but", "such", "most", "more", "than", "about", "into", "over", "under",
               "through", "during", "projects", "project", "schools", "school", "students", "teachers", "training", "learning", "education",
               "skills", "young", "people", "support", "development", "activities", "approach", "approaches", "organisations", "organisation"}
HR_FUNCTION = {"je", "su", "se", "koji", "koja", "koje", "od", "za", "iz", "kao", "ili", "nije", "nema", "dokaza", "najčešće", "projekata",
               "projekta", "projekt", "škola", "županija", "ukupno", "razdoblje", "razdoblju", "koordinator", "partner", "ima", "bilo"}
HR_LETTERS = re.compile(r"[čćžšđČĆŽŠĐ]")
WORD = re.compile(r"[A-Za-zČĆŽŠĐčćžšđ]+")


def strip_names(text: str) -> str:
    """Remove what is a name and not wording: text in brackets (titles, towns), in quotation marks, and capitalised runs (organisation names)."""
    t = re.sub(r"\([^()]*\)", " ", text)
    t = re.sub(r"[„“\"][^„“\"”]*[”“\"]", " ", t)
    return t


NAME_KEYS = {"name", "org_name", "title", "town", "place", "organisation", "coordinator", "partner", "similar", "top_organisation"}


def names_in(obj, out: set) -> set:
    """Strings the tools returned as names (organisations, projects, towns): they are quoted in answers as they are, in whatever language they are written."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in NAME_KEYS and isinstance(v, str) and len(v) > 2:
                out.add(v)
            else:
                names_in(v, out)
    elif isinstance(obj, list):
        for v in obj:
            names_in(v, out)
    return out


def leaks(answer: str, lang: str, names: set | None = None) -> list[str]:
    for n in sorted(names or (), key=len, reverse=True):
        answer = answer.replace(n, " ")
    text = strip_names(answer)
    words = WORD.findall(text)
    out = []
    for w in words:
        lw = w.lower()
        if lang == "hr" and lw in EN_FUNCTION:
            out.append(w)
        if lang == "en" and (lw in HR_FUNCTION or HR_LETTERS.search(w)):
            out.append(w)
    return out


def build_questions(con) -> dict[str, list[tuple[str, str]]]:
    """-> {group: [(lang, question)]}"""
    q = defaultdict(list)
    orgs = [r[0] for r in con.execute("""select o.name from organisation o join participation p using (org_id) group by o.org_id, o.name
                                         order by count(distinct p.project_id) desc limit 40""").fetchall()]
    for o in orgs:
        q["orgs"] += [("hr", f"Koliko KA2 projekata ima {o}?"), ("hr", f"Je li {o} koordinirala KA2 projekt?"),
                      ("hr", f"S kojim zemljama najčešće surađuje {o}?"), ("hr", f"Koje su slične ustanove kao {o}?"),
                      ("en", f"How many KA2 projects does {o} have?"), ("en", f"Has {o} ever coordinated a KA2 project?"),
                      ("en", f"Which countries does {o} work with most?")]
    counties = [r[0] for r in con.execute("select label from county").fetchall()]
    for c in counties:
        q["counties"] += [("hr", f"Koliko škola u {c} sudjeluje u KA2?"), ("hr", f"Koje su najaktivnije organizacije u {c}?"),
                          ("hr", f"Koliko projekata ima {c}?"), ("en", f"How many schools in {c} take part in KA2?"),
                          ("en", f"Which organisations are most active in {c}?")]
    q["national"] += [("hr", x) for x in [
        "Koja zemlja najčešće koordinira KA2 projekte?", "Koje vrste organizacija najčešće koordiniraju KA2 projekte iz Hrvatske?",
        "Koliki je udio Hrvatske u KA2 projektima EU?", "Koliko KA2 projekata ima hrvatskog sudionika?", "Koliko projekata koordinira Hrvatska?",
        "Kolika je prolaznost prijava za KA2 2023.?", "Koliko je prijava podneseno 2022.?", "Koja je županija ispod očekivanja po udjelu škola u KA2?",
        "Koliko je ukupna vrijednost KA2 projekata?", "Koliko organizacija iz Hrvatske sudjeluje u KA2?", "Koje su županije iznad državnog prosjeka?"]]
    q["national"] += [("en", x) for x in [
        "Which country coordinates the most KA2 projects?", "What types of organisations coordinate KA2 projects from Croatia?",
        "What is Croatia's share of EU KA2 projects?", "How many KA2 projects have a Croatian participant?", "How many projects does Croatia coordinate?",
        "What was the KA2 success rate in 2023?", "Which counties are above the national rate for schools?", "What is the total value of KA2 projects?"]]
    nodes = con.execute("""select n.node_id, n.kind, n.label_en, l.label_hr from graph_node n left join concept_label l using(node_id)
                           where n.kind <> 'topic' order by n.n_projects desc limit 45""").fetchall()
    for nid, kind, en, hr in nodes:
        hr = hr or en
        q["concepts"] += [("hr", f"Što znamo o pojmu {hr}?"), ("hr", f"Koji se pristupi koriste uz {hr}?"), ("hr", f"Koji su problemi povezani s {hr}?"),
                          ("en", f"What do projects do about {en}?"), ("en", f"Which approaches go with {en}?"), ("en", f"What goes with {en}?")]
    q["concepts"] += [("hr", x) for x in [
        "Koje su najčešće metode u KA2 projektima?", "Koji su najčešći problemi koje projekti rješavaju?", "Koje su najčešće ciljne skupine?",
        "Koji su najčešći rezultati projekata?", "Što se promijenilo kroz vrijeme u temama?", "Koji pristupi rastu?", "Koje su glavne teme?",
        "Što očekivati od tipičnog projekta?", "Koje skupine pojmova postoje?", "Koji su pojmovi najpovezaniji?", "Koji pristupi slabe?",
        "Što je tipičan projekt za škole?", "rani prekid školovanja", "borba protiv vršnjačkog nasilja", "Koje probleme KA2 projekti najčešće rješavaju?"]]
    q["concepts"] += [("en", x) for x in [
        "What are the most common methods in KA2 projects?", "What are the most common problems projects address?", "Who are the most common target groups?",
        "What are the most common outputs?", "How have the themes changed over time?", "Which approaches are growing?", "What are the main themes?",
        "What to expect from a typical project?", "Which groups of concepts exist?", "Which concepts are most connected?", "Which approaches are fading?",
        "early school leaving", "fighting bullying among students", "Which problems do KA2 projects address most often?"]]
    topics = ["robotici", "inkluziji", "digitalnim vještinama", "zaštiti okoliša", "migrantima", "mentalnom zdravlju", "STEM obrazovanju", "starijim osobama"]
    topics_en = ["robotics", "inclusion", "digital skills", "environmental protection", "migrants", "mental health", "STEM education", "older people"]
    for t, e in zip(topics, topics_en):
        q["projects"] += [("hr", f"Postoji li KA2 projekt o {t}?"), ("hr", f"Pronađi projekte o {t}"), ("en", f"Is there a KA2 project about {e}?"),
                          ("en", f"Find projects about {e}")]
    # questions that mix the languages themselves, and ones the system should refuse or cannot answer
    q["mixed"] += [("hr", x) for x in [
        "Koliko projects ima Gimnazija Metković?", "Which projekti postoje o robotici?", "Što je online training u KA2?", "Koliko KA2 projekata ima University of Dubrovnik?",
        "Tell me o projektima za učitelje", "Koji su best practices u KA2?", "Koja je prva tema svakog projekta?", "Tko je ravnatelj Gimnazije Metković?",
        "kakvo je vrijeme", "Koliko je 2 + 2?", "Daj mi e-mail adresu Sveučilišta u Zagrebu"]]
    q["mixed"] += [("en", x) for x in [
        "How many projekata does Gimnazija Metković have?", "What is the weather in Zagreb?", "Who is the director of Gimnazija Metković?",
        "Give me the e-mail of the University of Zagreb", "What was the first topic of every Erasmus+ project?", "hello", "What can you do?"]]
    return q


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", type=int, default=25)
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    con = duckdb.connect(str(DB_PATH), read_only=True)
    qs = build_questions(con)
    con.close()
    asker = Asker()
    rows = []
    for group, items in qs.items():
        if a.only and group != a.only:
            continue
        for lang, question in items:
            try:
                r = asker.ask(question)
            except Exception as e:                      # a crash is the worst kind of answer: record it
                rows.append(dict(group=group, asked_lang=lang, answer_lang=lang, question=question, answer=f"CRASH {type(e).__name__}: {str(e)[:100]}", route=None, verified=False, leaks=["CRASH"], wrong_language=False))
                continue
            lk = leaks(r["answer"], r["lang"], names_in(r.get("tools", []), set()))
            rows.append(dict(group=group, asked_lang=lang, answer_lang=r["lang"], question=question, answer=r["answer"], route=r["route"], verified=r["verified"],
                             leaks=lk, wrong_language=(r["lang"] != lang and group != "mixed")))
    n = len(rows)
    bad = [r for r in rows if r["leaks"]]
    wl = [r for r in rows if r["wrong_language"]]
    print(f"{n} questions; {len(bad)} answers with words of the other language ({100 * len(bad) / n:.0f} %); {len(wl)} answered in a language other than the question's")
    by = Counter((r["group"], r["asked_lang"]) for r in bad)
    tot = Counter((r["group"], r["asked_lang"]) for r in rows)
    for k in sorted(tot):
        print(f"  {k[0]:9s} {k[1]}: {by.get(k, 0):3d} of {tot[k]:3d} mixed")
    words = Counter(w.lower() for r in bad for w in r["leaks"])
    print("most common leaked words:", words.most_common(15))
    print(f"\n--- {min(a.show, len(bad))} examples ---")
    for r in bad[: a.show]:
        print(f"[{r['group']}/{r['asked_lang']}/{r['route']}] {r['question']}\n    -> {r['answer'][:300]}\n    leaks: {r['leaks'][:6]}")
    if wl:
        print("\n--- answered in the wrong language ---")
        for r in wl[:10]:
            print(f"[{r['group']}] asked {r['asked_lang']}, answer {r['answer_lang']}: {r['question']}\n    -> {r['answer'][:200]}")
    out = ROOT / "eval" / "results" / "mix_test.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nall answers: {out}")


if __name__ == "__main__":
    main()
