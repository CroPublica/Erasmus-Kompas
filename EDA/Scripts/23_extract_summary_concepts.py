"""Extract concepts from KA2 project summaries and add them to the knowledge graph.

Reads  Data/processed/knowledge_graph.json (made by 22_build_knowledge_graph.py) and the two KA2 parquet
files, and writes the enriched graph back to the same file. Safe to re-run (it removes its own nodes/edges first).

Nodes added:  Topic (from the EU 'Topics' column), Problem, TargetGroup, Approach, Output
Edges added:  Project -TAGGED-> Topic, -ADDRESSES-> Problem, -TARGETS-> TargetGroup, -USES-> Approach,
              -PRODUCES-> Output, Problem -ADDRESSED_BY-> Approach (aggregated), concept -CO_OCCURS{pmi}- concept
Project properties added:  summary_structured, keywords, is_good_practice

Method: rule-based. Each canonical concept has regex patterns; they are matched only in the summary sections
where that kind of concept is expected (Problem: Background+Objectives, Approach: Implementation+Objectives,
Output: Results, TargetGroup: all). Summaries without << Section >> markers are matched as one block.
"""
import json
import math
import re
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer

PROC = Path(__file__).resolve().parent.parent / "Data" / "processed"
GRAPH = PROC / "knowledge_graph.json"
OWN_LABELS = {"Topic", "Problem", "TargetGroup", "Approach", "Output"}
OWN_EDGES = {"TAGGED", "ADDRESSES", "TARGETS", "USES", "PRODUCES", "ADDRESSED_BY", "CO_OCCURS"}

# ----------------------------------------------------------------------------- vocabularies
PROBLEMS = {
    "Skills gap / labour-market mismatch": r"skills? (gap|mismatch|shortage)|lack of (the )?(necessary |relevant |adequate )?(skills|competences)|labou?r market (needs|mismatch|demands)|employability",
    "Low digital skills / digital divide": r"digital (divide|gap|skills|competences?|literacy|exclusion|inclusion)|lack of digital",
    "Climate change & environmental degradation": r"climate (change|crisis|emergency)|global warming|environmental (degradation|crisis|pollution|problems)|carbon emissions|pollution|plastic|food waste",
    "Social exclusion & inequality": r"social (exclusion|inclusion|inequalit)|marginali[sz]ed|fewer opportunities|disadvantaged|inequalit(y|ies)|poverty|at risk of",
    "Discrimination & intolerance": r"discriminat|racism|xenophob|intoleran|hate speech|stereotyp|prejudice",
    "Mental health & well-being": r"mental health|mental disorders?|well-?being|burn-?out|anxiety|depression|\b(school|work|exam|academic) stress|stress (management|levels|reduction)",
    "COVID-19 impact": r"covid|pandemic",
    "Early school leaving & low attainment": r"early school leav|drop-?outs?|school failure|underachiev|low (basic )?skills|illiterac|low achievement|learning loss",
    "Youth unemployment": r"unemployment|\bneets?\b|jobless|not in education, employment",
    "Low civic participation": r"civic (engagement|participation)|active citizenship|democratic participation|political participation|low turnout|democratic values",
    "Disinformation & weak media literacy": r"disinformation|fake news|misinformation|media literacy",
    "Migration & integration": r"migrants?|refugees?|asylum|immigrants?|migration (flows?|crisis|background)|integration of",
    "Gender inequality & gender-based violence": r"gender (equality|gap|stereotyp|inequalit|based violence)|domestic violence|violence against women|sexism",
    "Teachers' training needs": r"teachers?'? (shortage|training needs|professional development)|professional development of (teachers|educators|trainers)|lack of (qualified|trained)|teacher burn|training needs|teachers? (need|lack|require)\w* (training|support|skills)|need for (teacher|teachers'|educator) training",
    "Rural depopulation & brain drain": r"rural (depopulation|exodus|decline)|depopulat|brain drain|young people leaving (rural|villages|their)|abandon\w* (rural|villages)",
    "Cultural heritage at risk": r"cultural heritage|intangible heritage|traditional crafts",
    "Entrepreneurship deficit": r"entrepreneurship (skills|education|culture)|lack of entrepreneur|start-?ups?",
    "Ageing population": r"ageing|aging population|older (adults|people)|senior citizens|elderly",
    "Language barriers": r"language barriers?|foreign language|multilingual|plurilingual|language learning",
    "Low STEM participation": r"under-?represent\w* in (stem|steam|science|technology)|(lack of|declining|low|decreasing) interest in (science|stem|steam|maths|mathematics)|stem (skills )?(gap|shortage)|girls in stem",
    "Bullying, violence & radicalisation": r"bullying|cyber-?bullying|radicali[sz]|youth violence|school violence|violent extremism",
    "Physical inactivity & unhealthy lifestyles": r"sedentary|physical (inactivity|activity)|obesity|healthy lifestyles?|unhealthy",
    "Learning difficulties & special needs": r"special (educational )?needs|disabilit|learning difficult|dyslexi|autis|inclusive education",
    "Low quality / relevance of education": r"quality of (education|teaching|training)|outdated (curricul|teaching|methods)|traditional teaching|relevance of (education|training)",
    "Sustainability & green skills gap": r"green (skills|jobs|transition|competences)|sustainable development goals|\bsdgs?\b|circular economy|green deal|education for sustainable|environmental (awareness|education|literacy)|sustainable (lifestyles?|consumption)",
    "Cybersecurity & online safety": r"cyber-?security|online safety|internet safety|data protection|online risks|digital safety",
}

TARGET_GROUPS = {
    "Pupils / school students": r"pupils|school ?children|school students|primary school students|secondary school students|schoolchildren|high school students",
    "Young people": r"young people|youth\b|young adults|teenagers|adolescents|young persons|young women and men",
    "Youth workers": r"youth workers?|youth leaders?|youth work professionals|youth organi[sz]ations",
    "Teachers": r"teachers|school staff|schoolteachers|teaching staff",
    "Trainers & educators": r"trainers|educators|adult educators|teacher educators|vet teachers|vet trainers|mentors",
    "School leaders": r"school (leaders|principals|heads|directors|management)|head ?teachers|principals",
    "University students": r"(university|higher education|college|bachelor|master|phd|graduate) students|students in higher education|undergraduates|\bhei students",
    "VET learners": r"vet (learners|students)|vocational (students|learners|pupils|school students)|apprentices|apprenticeships?",
    "Adult learners": r"adult learners|adult education (learners|participants)|low-?skilled adults|adults\b|adult students",
    "Older adults": r"older (adults|people|persons|learners)|seniors?\b|senior citizens|elderly|over 50|50\+",
    "Migrants & refugees": r"migrants?|refugees?|asylum seekers?|newcomers|third-?country nationals",
    "People with disabilities / special needs": r"disabilit|special (educational )?needs|impairment|learning difficulties|dyslexi|autis|neurodiver",
    "NEETs & early school leavers": r"\bneets?\b|early school leavers|school drop-?outs|not in education, employment",
    "Disadvantaged learners": r"fewer opportunities|disadvantaged|vulnerable (groups|youth|learners|people|children)|marginali[sz]ed|socially excluded|at risk of (social )?exclusion|low socio-?economic",
    "Unemployed / job seekers": r"unemployed|job ?seekers?|long-?term unemployed|jobless",
    "Women & girls": r"women\b|girls\b|female",
    "Parents & families": r"parents|families|caregivers|carers",
    "Entrepreneurs & SMEs": r"(aspiring|young|social|women|potential|future) entrepreneurs|start-?ups?|\bsmes?\b|small and medium|small businesses|freelancers|micro-?enterprises",
    "Policy makers & authorities": r"policy ?makers|decision ?makers|public authorities|local authorities|public administration|local government",
    "NGOs, civil society & volunteers": r"\bngos?\b|civil society|volunteers?|non-?governmental|associations\b|grassroots",
    "Researchers & academics": r"researchers|academic staff|university staff|lecturers|professors|academics|scholars",
    "Employers & companies": r"employers|companies|enterprises|businesses|industry partners|private sector",
    "Roma & minorities": r"\broma\b|ethnic minorit|national minorit|minority groups|indigenous",
    "Young children (early childhood)": r"pre-?school|kindergarten|young children|early childhood|nursery|primary school children",
    "Local communities & general public": r"local communit|general public|citizens|wider public|community members",
    "Students (unspecified)": r"\bstudents\b",
    "Rural population": r"rural (youth|population|areas|communities|youngsters)|remote areas",
    "Health & social care professionals": r"health ?care (workers|professionals|staff)|social workers|nurses|psychologists|counsellors|therapists|social care (workers|professionals|staff)",
    "Career & guidance professionals": r"career (guidance|counsel)|guidance counsel|career advisors",
}

APPROACHES = {
    "Peer learning & mentoring": r"peer[- ](learning|education|to[- ]peer|mentoring|support|tutoring|review)|mentor(ing|ship)|buddy|tutoring",
    "E-learning / online platform": r"learning platform|e-?learning|online (course|learning|platform|training|modules?)|\bmooc|\blms\b|moodle|distance learning|web-?based platform",
    "Mobile app": r"mobile app|smartphone app|\bapps?\b|application for (smart)?phones",
    "Gamification & game-based learning": r"gamif|game[- ]?based|serious games?|escape rooms?|board games?|(educational|music-based|learning) games?|role-?play|simulation games?",
    "Immersive tech (VR/AR)": r"virtual reality|augmented reality|\bvr\b|\bar\b|immersive|metaverse|3d (models|printing)",
    "Artificial intelligence & data": r"artificial intelligence|\bai\b|machine learning|chatbot|big data|learning analytics|chatgpt|generative",
    "Non-formal & experiential learning": r"non-?formal|experiential learning|learning by doing|learning by playing|outdoor (learning|education|activities)|hands-?on",
    "Project / problem-based learning": r"project[- ]?based|problem[- ]?based|inquiry[- ]?based|challenge[- ]?based|design thinking|phenomenon[- ]?based|case[- ]based learning",
    "STEM / STEAM education": r"\bstem\b|\bsteam\b|robotics|coding|programming|maker ?spaces?|computational thinking",
    "Blended / flipped learning": r"blended|flipped|hybrid (learning|teaching)",
    "Co-creation & participatory methods": r"co-?creat|co-?design|participatory|focus groups?|living labs?|stakeholder (consultation|engagement)|youth participation",
    "Training of trainers / teacher training": r"training of trainers|teacher training|train-the-trainer|training courses?|training sessions?|capacity[- ]building|professional development|upskilling",
    "Pilot testing": r"\bpilot(s|ing|ed)?\b|test(ing)? phase|tested (with|in)",
    "Exchange of good practices & mobility": r"exchange of (good |best )?practices?|exchanging (good |best )?practices?|study visits?|job shadowing|learning visits|joint staff training|peer visits",
    "Needs analysis & research": r"needs (analysis|assessment)|survey|questionnaire|desk research|state[- ]of[- ]the[- ]art|literature review|comparative (analysis|study)|focus group research",
    "Storytelling & arts-based methods": r"storytelling|theatre|drama|art-?based|artistic|music|creative (methods|writing|workshops)|photography|film",
    "Open educational resources": r"open educational resources|\boers?\b|open access|open-source",
    "Micro-credentials & recognition of skills": r"micro-?credential|digital badges?|\bbadges\b|europass|youthpass|validation of|recognition of|certification",
    "Intergenerational learning": r"inter-?generational",
    "Inclusive & universal design": r"universal design|\budl\b|inclusive (teaching|methods|pedagog\w*|classroom|design)|accessib(le|ility) (of|for|tools|design)",
    "Awareness-raising campaigns": r"awareness[- ]rais|campaigns?|information (days|sessions)|public events",
    "Curriculum & competence frameworks": r"curricul(um|a) (development|design|reform|renewal)|(develop|design|creat|adapt|revis)\w* (a |an |the )?(new |joint |innovative |common )?curricul|competence framework|competency framework|learning outcomes|qualification framework|syllabus",
    "Volunteering & service learning": r"service[- ]learning|community service|volunteering (activities|programmes?|projects?|opportunities|schemes?|work)|volunteer (programmes?|work|schemes?|exchange)|solidarity corps",
    "Entrepreneurship education": r"entrepreneurship education|business (simulation|plan|ideas)|incubat|start-?up|mini-?companies|student enterprises",
    "Language learning methods": r"language learning|\bclil\b|foreign language|language teaching|language courses",
    "Digital storytelling & media production": r"podcast|videos?\b|digital storytelling|animation|media production|social media (campaign|content)",
    "Sustainability & eco-education": r"eco-?(schools?|education)|education for sustainable|green (school|campus|practices)|recycl|urban garden|school garden",
    "Mindfulness & social-emotional learning": r"mindfulness|social-?emotional|emotional (intelligence|learning|education|skills)|self-?regulation|resilience (training|building|skills)",
    "Quality assurance & evaluation": r"quality assurance|evaluation (plan|report|methodology)|impact (assessment|evaluation)|monitoring and evaluation",
}

OUTPUTS = {
    "Handbook / guide / toolkit": r"handbook|guidebook|guidelines|\bguides?\b|toolkit|tool-?box|manuals?|playbook|practical guide|good practice (guide|collection)|how-to|methodology (guide|handbook|manual)",
    "Curriculum / training programme": r"(develop|creat|design|produc)\w* (a |an |the )?(new |joint |innovative |online |training |common )*(curricul\w*|courses?|modules?|training (programme|program|package))|training (programmes?|programs?|packages?|modules?|curriculum)|online courses?|e-?learning courses?|\bmoocs?\b",
    "Online platform / portal": r"online platform|learning platform|web platform|portal|e-?learning (platform|course)|virtual (platform|space|campus|academy)|digital platform|web ?app",
    "Mobile app / software tool": r"mobile app|\bapps?\b|software|(digital|online|web|interactive) tools?|web application",
    "Educational game": r"games?\b|escape rooms?|board game|card game|quiz",
    "Video / podcast / multimedia": r"videos?\b|podcast|webinar|animations?|documentar|films?\b|short movies|multimedia|tutorials?",
    "Lesson plans & teaching materials": r"lesson plans?|educational (resources|materials)|teaching (materials|resources|units)|learning (materials|resources|units|scenarios)|worksheets|activity cards|didactic|training materials|e-books?|ebooks?",
    "Policy recommendations / white paper": r"policy (recommendations|paper|brief|guidelines)|recommendations\b|white paper|position paper|policy documents?",
    "Research report / study": r"research (report|paper)|\bstudy\b|\bstudies\b|needs assessment|state[- ]of[- ]the[- ]art|comparative (analysis|study)|situation analysis",
    "Database / repository / catalogue": r"database|repositor|librar(y|ies)|catalogue|catalog\b|inventory|collection of (good )?practices|open educational resources|\boers?\b",
    "Network / community of practice": r"networking|(professional|transnational|international|european|new|strong|sustainable|school|teacher) networks?|community of practice|coalition|platform for cooperation",
    "Certification / badges / recognition": r"certificat|badges?|micro-?credential|accreditation|label\b|europass|youthpass|recognition",
    "Assessment / self-assessment tool": r"assessment tool|self-?assessment|competence framework|competency framework|assessment framework|evaluation tool|diagnostic tool|questionnaires?",
    "Events, conferences & exhibitions": r"conferences?|festival|exhibition|summer school|camps?\b|multiplier events?|hackathon|final event|seminars?",
    "Publication / brochure / article": r"publications?|brochures?|booklet|magazine|articles?\b|newsletters?|infographic|leaflets?|posters?|scientific papers?",
    "Trained participants": r"(teachers|trainers|educators|youth workers|staff|students|participants|learners|pupils)( were| have been| had been)? (trained|educated|upskilled)|trained (teachers|trainers|educators|youth workers)|(teachers|trainers|educators|youth workers|staff|participants) (took part in|participated in|attended|received|completed) (the |a )?(training|courses?|workshops?)",
    "Increased awareness / attitudes": r"increased (awareness|knowledge|understanding|competences?|skills)|raised awareness|improved (skills|competences|knowledge|attitudes)|enhanced (skills|competences|knowledge)",
    "Pilot implementation / testing": r"\bpilot(s|ing|ed)?\b|piloted|tested (with|in)|testing phase",
    "New partnerships & cooperation": r"new partnerships?|strengthened (cooperation|partnerships|networks)|long-?term (cooperation|partnerships)|follow-?up projects?",
}

SECTIONS = ("Background", "Objectives", "Implementation", "Results")
WHERE = {  # which sections each concept type is searched in
    "Problem": ("Background", "Objectives"),
    "TargetGroup": SECTIONS,
    "Approach": ("Implementation", "Objectives"),
    "Output": ("Results",),
}
VOCAB = {"Problem": PROBLEMS, "TargetGroup": TARGET_GROUPS, "Approach": APPROACHES, "Output": OUTPUTS}
EDGE = {"Problem": "ADDRESSES", "TargetGroup": "TARGETS", "Approach": "USES", "Output": "PRODUCES"}
COMPILED = {k: {name: re.compile(p, re.I) for name, p in v.items()} for k, v in VOCAB.items()}

SECTION_RE = re.compile(r"<< (Background|Objectives|Implementation|Results) >>")
URL_RE = re.compile(r"https?://\S+|www\.\S+")


def split_sections(text):
    text = URL_RE.sub(" ", text or "")
    parts = SECTION_RE.split(text)
    if len(parts) < 3:
        return {s: text for s in SECTIONS}, False  # unstructured: match the whole text everywhere
    return {parts[i]: parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}, True


def extract(sections):
    found = {}
    for kind, vocab in COMPILED.items():
        hits = {}
        for name, rx in vocab.items():
            where, n = [], 0
            for sec in WHERE[kind]:
                m = rx.findall(sections.get(sec, ""))
                if m:
                    where.append(sec)
                    n += len(m)
            if n:
                hits[name] = (where, n)
        found[kind] = hits
    return found


# ----------------------------------------------------------------------------- load
graph = json.loads(GRAPH.read_text(encoding="utf-8"))
nodes = [n for n in graph["nodes"] if n["label"] not in OWN_LABELS]
edges = [e for e in graph["edges"] if e["type"] not in OWN_EDGES]
for e in edges:
    if e["type"] == "PARTNER_IN":
        e["type"] = "PARTNERS_IN"
by_id = {n["id"]: n for n in nodes}

cols = ["Project Identifier", "Project Summary", "Topics", "Is Good Practice"]
ka2 = pd.concat([pd.read_parquet(PROC / f"ka2_{p}.parquet", columns=cols) for p in ("2014-2020", "2021-2027")])
ka2["Project Identifier"] = ka2["Project Identifier"].str.strip()
ka2 = ka2.set_index("Project Identifier")

projects = {}  # ka2 identifier -> graph node id
for n in nodes:
    if n["label"] == "Project":
        kid = n.get("ka2_identifier") or (n["project_id"] if n.get("source") == "KA2 EU file" else None)
        if kid and kid in ka2.index:
            projects[kid] = n["id"]
print(f"projects with a KA2 summary: {len(projects)}")

# ----------------------------------------------------------------------------- per-project extraction
per_project = {}
texts = {}
n_structured = 0
for kid, pid in projects.items():
    row = ka2.loc[kid]
    sections, structured = split_sections(row["Project Summary"])
    n_structured += structured
    by_id[pid]["summary_structured"] = structured
    by_id[pid]["is_good_practice"] = row["Is Good Practice"] == "Yes"
    texts[pid] = " ".join(sections.values())
    per_project[pid] = extract(sections)
    per_project[pid]["Topic"] = {
        t.strip(): (["Topics"], 1) for t in re.split(r";", row["Topics"] if isinstance(row["Topics"], str) else "") if t.strip()
    }
print(f"structured summaries: {n_structured}")

# ----------------------------------------------------------------------------- keywords (TF-IDF)
stop = list(ENGLISH_STOP_WORDS | {
    "project", "projects", "partners", "partner", "partnership", "activities", "activity", "organisations",
    "organizations", "organisation", "organization", "results", "result", "objectives", "objective", "aim",
    "aims", "aimed", "implementation", "implemented", "background", "countries", "country", "transnational",
    "meetings", "meeting", "using", "use", "used", "developed", "development", "develop", "participants",
    "target", "groups", "group", "address", "addressed", "applied", "work", "working", "including", "different",
    "new", "based", "level", "year", "years", "ensure", "increase", "improve", "create", "created", "provide",
    "dissemination", "multiplier", "events", "event", "http", "https", "www", "com", "eu", "erasmus",
})
ids = list(texts)
tfidf = TfidfVectorizer(ngram_range=(1, 2), stop_words=stop, min_df=4, max_df=0.15, sublinear_tf=True,
                        token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z-]{2,}\b")
X = tfidf.fit_transform([texts[i] for i in ids])
vocab = tfidf.get_feature_names_out()
for r, pid in enumerate(ids):
    row = X.getrow(r)
    top = sorted(zip(row.data, row.indices), reverse=True)
    chosen = []
    for _, j in top:
        w = vocab[j]
        if not any(w in c or c in w for c in chosen):  # drop 'digital' when 'digital tools' is already in
            chosen.append(w)
        if len(chosen) == 8:
            break
    by_id[pid]["keywords"] = chosen

# ----------------------------------------------------------------------------- nodes and edges
concept_projects = defaultdict(set)  # concept node id -> project node ids
good = {pid for pid in ids if by_id[pid].get("is_good_practice")}
for pid, found in per_project.items():
    for kind in ("Topic", "Problem", "TargetGroup", "Approach", "Output"):
        for name, (where, n) in found[kind].items():
            cid = f"{kind.lower()}:{name}"
            if cid not in by_id:
                by_id[cid] = {"id": cid, "label": kind, "name": name}
                nodes.append(by_id[cid])
            rel = "TAGGED" if kind == "Topic" else EDGE[kind]
            props = {} if kind == "Topic" else {"sections": where, "mentions": n}
            edges.append({"source": pid, "type": rel, "target": cid, **props})
            concept_projects[cid].add(pid)

# aggregated: Problem -ADDRESSED_BY-> Approach
pa = defaultdict(set)
for pid, found in per_project.items():
    for p in found["Problem"]:
        for a in found["Approach"]:
            pa[(f"problem:{p}", f"approach:{a}")].add(pid)
n_pa = 0
for (p, a), ps in pa.items():
    if len(ps) >= 3:
        edges.append({"source": p, "type": "ADDRESSED_BY", "target": a, "n_projects": len(ps),
                      "n_good_practice": len(ps & good)})
        n_pa += 1

# aggregated: concept -CO_OCCURS{pmi}- concept
N = len(per_project)
co = Counter()
for pid, found in per_project.items():
    cs = sorted(f"{k.lower()}:{n}" for k in ("Topic", "Problem", "TargetGroup", "Approach", "Output") for n in found[k])
    co.update(combinations(cs, 2))
n_co = 0
for (a, b), c in co.items():
    if c < 8:
        continue
    pmi = math.log((c / N) / ((len(concept_projects[a]) / N) * (len(concept_projects[b]) / N)))
    if pmi >= 0.5:
        edges.append({"source": a, "type": "CO_OCCURS", "target": b, "n_projects": c, "pmi": round(pmi, 3)})
        n_co += 1

# ----------------------------------------------------------------------------- write
graph["nodes"], graph["edges"] = nodes, edges
graph["meta"]["node_counts"] = dict(Counter(n["label"] for n in nodes))
graph["meta"]["edge_counts"] = dict(Counter(e["type"] for e in edges))
graph["meta"]["notes"] = [n for n in graph["meta"]["notes"] if not n.startswith("Concept")] + [
    "Concept nodes (Problem, TargetGroup, Approach, Output) are extracted from KA2 summaries with curated regex "
    "vocabularies (rule-based, English only); Topic nodes come from the EU 'Topics' column. A missing edge means "
    "'not detected', not 'absent'. CO_OCCURS and ADDRESSED_BY are aggregated (PMI over projects with a summary).",
]
GRAPH.write_text(json.dumps(graph, ensure_ascii=False, indent=1), encoding="utf-8")

print("\ncoverage (share of projects with >=1 concept of the kind):")
for kind in ("Topic", "Problem", "TargetGroup", "Approach", "Output"):
    cov = sum(1 for f in per_project.values() if f[kind]) / N
    print(f"  {kind:12s} {cov:5.1%}   mean {sum(len(f[kind]) for f in per_project.values())/N:.1f} per project")
print(f"ADDRESSED_BY edges {n_pa}, CO_OCCURS edges {n_co}")
for kind in ("Problem", "TargetGroup", "Approach", "Output"):
    c = Counter(n for f in per_project.values() for n in f[kind])
    print(f"\n{kind} — top / bottom:")
    print("  ", c.most_common(6))
    print("  ", [(n, c.get(n, 0)) for n in VOCAB[kind] if c.get(n, 0) < 15])
print("\n", json.dumps(graph["meta"]["node_counts"], ensure_ascii=False))
