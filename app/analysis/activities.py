"""Count the activities that KA2 projects describe doing, merged into groups and stages (rule-based, English summaries).

  python analysis/activities.py        writes data/activities.json and prints a summary

Each activity is a regular expression matched against the whole project summary; a project counts once per activity.
The 'stage' orders the groups into a typical project flow; 'pos' is the median relative position (0 = start, 1 = end of the
summary text) of the first mention, a check on that order. Rule-based: it finds wording, not proof that the activity happened
(a summary says what is planned). A missing match means "not mentioned", not "not done".
"""
import json, re, statistics, sys
from collections import Counter
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from common import connect  # noqa: E402

# (activity, group, stage, regex)
ACT = [
 # 1 understand needs
 ("Survey or questionnaire", "Research and needs analysis", 1, r"\b(survey|surveys|questionnaire|questionnaires|online poll)\b"),
 ("Interviews", "Research and needs analysis", 1, r"\binterview(s|ed|ing)?\b"),
 ("Focus groups", "Research and needs analysis", 1, r"\bfocus group(s)?\b"),
 ("Needs analysis", "Research and needs analysis", 1, r"\bneeds? (analysis|assessment|identification|mapping)|analysis of (the )?needs|training needs"),
 ("Desk research or literature review", "Research and needs analysis", 1, r"\bdesk research|literature review|state[- ]of[- ]the[- ]art|review of (the )?(literature|existing)|comparative (study|analysis)|benchmark"),
 ("Collecting good practices", "Research and needs analysis", 1, r"\b(collect|collection|mapping|compilation|catalogue|inventory) of (good|best|existing) practices?|good practices? (collection|catalogue|database)|best practices? (collection|catalogue)"),
 # 2 design and develop
 ("Curriculum or course design", "Design and development", 2, r"\bcurricul(um|a)\b|course (design|development|content)|syllabus|training (programme|program|package|module)s?\b|learning (module|unit|path)s?\b"),
 ("Toolkit, handbook or guidelines", "Design and development", 2, r"\b(toolkit|tool kit|handbook|guidebook|manual|practical guide|good practice guide|playbook)\b|\bguidelines (for|on|to)\b"),
 ("Online platform, app or website", "Design and development", 2, r"\b(online platform|digital platform|e-?platform|web ?platform|mobile app|mobile application|app\b|web ?application|web ?portal|online tool|digital tool|software)\b"),
 ("E-learning or online course", "Design and development", 2, r"\b(e-?learning|online course|mooc|moodle|online training|virtual classroom|learning management system|webinar)s?\b"),
 ("Open educational resources", "Design and development", 2, r"\bopen educational resources?|\boers?\b|open access (materials|resources)|open resources"),
 ("Games and gamification", "Design and development", 2, r"\bgamif|serious game|educational game|escape room|board game|game-based|(educational|digital|serious|online|learning|video|mobile|card) games?\b"),
 ("Videos, podcasts or multimedia", "Design and development", 2, r"\b(video|videos|podcast|podcasts|animation|infographics?|multimedia|short film|documentary)\b"),
 ("Policy paper or recommendations", "Design and development", 2, r"\bpolicy (paper|brief|recommendation|document)s?|white paper|recommendations? (for|to) (policy|decision)|position paper"),
 ("Competence framework or certification", "Design and development", 2, r"\bcompetence framework|competency framework|micro-?credentials?|digital badges?|open badges?|certificat(e|ion)s?\b|validation of (skills|learning)"),
 # 3 learn, practise, test
 ("Workshops", "Learning and practice with people", 3, r"\bworkshops?\b"),
 ("Training courses and seminars", "Learning and practice with people", 3, r"\btraining (course|session|event|activity|activities|week|seminar)s?|\bseminars?\b|\btrain(ing)? of (teachers|trainers|staff|educators)|\bbootcamp"),
 ("Student or staff exchange, mobility", "Learning and practice with people", 3, r"\b(student|pupil|school|staff|teacher|youth|virtual|international) exchanges?\b|exchange (visit|programme|program|of (students|pupils|teachers|staff|learners))|\bmobilit(y|ies)\b|learning[/ ]teaching[/ ]training activit|\bltta|\bltt\b|job shadowing|short-?term (joint )?staff"),
 ("Summer school, camp or youth exchange", "Learning and practice with people", 3, r"\bsummer (school|camp|academy)|youth (exchange|camp)|\bcamps?\b|\bresidential\b"),
 ("Mentoring or coaching", "Learning and practice with people", 3, r"\bmentor(ing|s|ship)?\b|\bcoaching\b|\bcoaches\b|buddy"),
 ("Peer learning and exchange of practice", "Learning and practice with people", 3, r"\bpeer[- ](to[- ]peer )?(learning|review|exchange|teaching|education)|exchange of (good |best )?(practices?|experiences?|knowledge)|community of practice|learning community"),
 ("Study visits", "Learning and practice with people", 3, r"\bstudy visits?|field (trip|visit)s?|site visits?"),
 ("Hackathon or competition", "Learning and practice with people", 3, r"\bhackathon|competition|contest|challenge[- ]based|datathon|makeathon"),
 ("Pilot or testing with users", "Learning and practice with people", 3, r"\bpilot(ing|ed|s)?\b|\btest(ing)? (phase|with|the)|piloting|field[- ]test|user testing|validation (phase|workshop)"),
 # 4 share
 ("Multiplier events", "Sharing and dissemination", 4, r"\bmultiplier events?\b|\bme\d\b|dissemination events?"),
 ("Conferences and info days", "Sharing and dissemination", 4, r"\bconferences?\b|\binfo(rmation)? days?\b|open days?|final event|round table|roundtable|panel discussion|symposium|forum\b"),
 ("Website and social media", "Sharing and dissemination", 4, r"\bsocial media|facebook|instagram|linkedin|twitter|youtube|\bwebsite\b|\bnewsletters?\b|\bblog\b"),
 ("Publications and articles", "Sharing and dissemination", 4, r"\bpublications?\b|\bpublish(ed|ing)?\b|\barticles?\b|scientific paper|leaflets?|brochures?|\bflyers?\b|press release"),
 ("Exhibitions and public events", "Sharing and dissemination", 4, r"\bexhibitions?\b|\bfestivals?\b|\bfairs?\b|public (event|presentation)|showcase|\bcampaign"),
 ("Networking and partnerships", "Sharing and dissemination", 4, r"\bnetworking\b|(build|building|establish|establishing|create|creating|develop|developing|set up|setting up) (a |an |the )?(european |international |transnational |local )?network\b|stakeholder (meeting|engagement|network)|\bpartnerships? with (local|business|industry)"),
 # 5 check and manage
 ("Evaluation and feedback", "Evaluation and quality", 5, r"\bevaluation\b|\bfeedback\b|self-?assessment|impact (assessment|analysis|measurement)|satisfaction (survey|questionnaire|level)s?"),
 ("Quality assurance and monitoring", "Evaluation and quality", 5, r"\bquality (assurance|plan|management|control)|\bmonitoring\b|\bindicators?\b|\bkpis?\b"),
 ("Project management and partner meetings", "Project management", 5, r"\b(kick-?off|transnational (project )?meetings?|project meetings?|partner meetings?|steering committee|management meetings?|online meetings?)\b"),
]
COMP = [(n, g, s, re.compile(rx, re.I)) for n, g, s, rx in ACT]


def main():
    con = connect(read_only=True)
    rows = con.execute("select project_id, period, summary from project where summary is not null and length(summary) > 80").fetchall()
    n_all = Counter(r[1] for r in rows); n_all["all"] = len(rows)
    hits = {}                                  # activity -> {project_id: first-mention relative position}
    for pid, period, text in rows:
        L = max(len(text), 1)
        for name, g, s, rx in COMP:
            m = rx.search(text)
            if m:
                hits.setdefault(name, {})[pid] = m.start() / L
    per = {pid: period for pid, period, _ in rows}
    out = {"n_projects": dict(n_all), "activities": [], "cooccurrence": []}
    for name, g, s, _ in COMP:
        h = hits.get(name, {})
        cnt = Counter(per[p] for p in h); cnt["all"] = len(h)
        out["activities"].append({"name": name, "group": g, "stage": s, "projects": dict(cnt),
                                  "share": {k: cnt[k] / n_all[k] for k in n_all}, "pos": round(statistics.median(h.values()), 3) if h else None})
    names = [a["name"] for a in out["activities"]]
    N = len(rows)
    for a, b in combinations(names, 2):
        sa, sb = set(hits.get(a, {})), set(hits.get(b, {}))
        inter = len(sa & sb)
        if inter >= 40:
            lift = inter * N / (len(sa) * len(sb))
            out["cooccurrence"].append({"a": a, "b": b, "both": inter, "jaccard": round(inter / len(sa | sb), 3), "lift": round(lift, 2)})
    Path(__file__).resolve().parent.parent.joinpath("data", "activities.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(dict(n_all))
    for a in sorted(out["activities"], key=lambda a: -a["projects"].get("all", 0)):
        print(f"{a['name']:44s} st{a['stage']} {a['projects'].get('all',0):5d} {100*a['share']['all']:5.1f}%  14-20 {100*a['share'].get('2014-2020',0):5.1f}%  21-27 {100*a['share'].get('2021-2027',0):5.1f}%  pos {a['pos']}")


if __name__ == "__main__":
    main()
