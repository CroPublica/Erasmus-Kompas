"""Extraction step (pipeline/50) and its gold-set scorer, without any model server."""
import importlib.util
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(ROOT / "pipeline"))
    spec.loader.exec_module(mod)
    return mod


step50 = load("pipeline/50_extract_concepts.py", "step50")
scorer = load("eval/gold/score_extraction.py", "scorer")
read_gold = load("eval/gold/read_gold.py", "read_gold")


def test_prompt_versions_exist_and_v2_asks_for_more():
    assert set(step50.INSTRUCTIONS) == {"v1", "v2"} and step50.PROMPT_VERSION in step50.INSTRUCTIONS
    v1, v2 = step50.INSTRUCTIONS["v1"], step50.INSTRUCTIONS["v2"]
    assert "max 6" in v1 and "up to 12" in v2                     # approaches cap raised
    assert "expected or achieved" in v2 and "implied" in v2        # outcomes and implied needs, from the gold-set corrections
    for v in (v1, v2):
        assert "{status}" in v and "{text}" in v                    # both fill in


def test_evidence_must_occur_in_the_text():
    text = "The project will build a Toolkit for teachers, and run pilot sessions in 3 schools."
    res = {"problems": [{"text": "x", "evidence": "build a toolkit for teachers"}],
           "approaches": [{"text": "pilots", "evidence": "run pilot sessions in 3 schools"}],
           "outputs": [{"text": "made up", "status": "planned", "evidence": "an award-winning app"}], "target_groups": []}
    out = step50.verify(res, text)
    assert out["problems"][0]["evidence_verified"] and out["approaches"][0]["evidence_verified"]
    assert out["outputs"][0]["evidence_verified"] is False             # an invented quote is flagged, not trusted


def test_clean_strips_links_and_caps_length():
    assert "http" not in step50.clean("see https://example.org/x and www.foo.eu now")
    assert len(step50.clean("a " * 10000)) <= step50.MAX_CHARS


def test_recall_by_meaning_with_a_fake_embedder():
    vocab = {"low media literacy": [1, 0], "weak media skills": [0.95, 0.31], "teacher training": [0, 1]}

    def embed(xs):
        m = np.array([vocab[x] for x in xs], dtype=float)
        return m / np.linalg.norm(m, axis=1, keepdims=True)

    assert scorer.recall_at(["low media literacy"], ["weak media skills", "teacher training"], embed, 0.72) == 1
    assert scorer.recall_at(["low media literacy"], ["teacher training"], embed, 0.72) == 0
    assert scorer.recall_at([], ["teacher training"], embed, 0.72) == 0


def test_gold_parser_reads_kept_unticked_and_added_items(tmp_path):
    f = tmp_path / "batch_99.md"
    f.write_text("# x\n\n---\n\n## P-1\n\n**Problems the project addresses**\n\n- [x] a need\n- [ ] a wrong thing\n\n+ an added need\n\n"
                 "**Approaches (what it does or uses)**\n\n- [x] workshops <!-- note -->\n\nReviewed by: A Reviewer\n", encoding="utf-8")
    rec = list(read_gold.parse(f))[0]
    assert rec["reviewer"] == "A Reviewer"
    assert [(i["kind"], i["text"], i["proposed"], i["correct"]) for i in rec["items"]] == [
        ("problem", "a need", True, True), ("problem", "a wrong thing", True, False), ("problem", "an added need", False, True),
        ("approach", "workshops", True, True)]


def test_generic_administration_is_flagged_not_real_methods():
    for text in ("Dissemination activities", "e-Meeting for project management", "three Transnational Project Meetings", "overall project evaluation",
                 "multiplier events to share results", "newsletter and social media posts"):
        assert step50.is_generic(text), text
    for text in ("animal-assisted interventions", "peer-to-peer training of youth workers", "board game with augmented reality", "needs assessment with young people",
                 "pilot sessions", "improved English language skills of students"):
        assert not step50.is_generic(text), text
