"""Step 51: the merge guards and the leader clustering, with hand-made vectors (no model)."""
import importlib.util
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
spec = importlib.util.spec_from_file_location("step51", ROOT / "pipeline" / "51_canonicalise.py")
step51 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(step51)
c = step51.compatible


def test_additions_merge_substitutions_do_not():
    assert c("peer learning", "peer learning activities", 0.9)
    assert c("micro-credentials", "offering micro-credentials", 0.88)
    assert c("exchange of good practices", "exchange of practices", 0.9)
    assert not c("need to address water issues", "need to address soil issues", 0.9)          # one word replaced by another
    assert not c("green skills", "digital skills", 0.9)
    assert c("organizations of civil society", "organisations of civil society", 0.985)        # a spelling variant is near-identical


def test_numbers_opposites_places_and_long_phrases_never_merge():
    assert not c("90 ects curriculum", "120 ects curriculum", 0.97)
    assert not c("representatives of public sector", "representatives of private sector", 0.97)
    assert not c("pilot course in serbia", "pilot course in croatia", 0.97)
    assert not c("new master level study programs", "new bachelor level study programs", 0.97)
    long_a = "improved skills in the fields of entrepreneurship self employment programming and virtual assistant work"
    assert not c(long_a, long_a + " for adults", 0.99)


def test_leader_clustering_uses_the_most_frequent_phrase_as_label_and_respects_the_veto():
    units = [("peer learning", 9), ("peer learning activities", 3), ("gamification", 2), ("green skills", 2), ("digital skills", 1)]
    vecs = np.array([[1, 0, 0], [0.97, 0.24, 0], [0, 1, 0], [0, 0.3, 0.95], [0, 0.75, 0.66]], dtype=float)
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
    out = step51.leader_clusters(units, vecs, 0.84, c)
    groups = [(units[l][0], [units[i][0] for i in m]) for l, m in out]
    assert ("peer learning", ["peer learning", "peer learning activities"]) in groups
    assert ("green skills", ["green skills"]) in groups and ("digital skills", ["digital skills"]) in groups     # near in meaning, vetoed


def test_clean_phrase():
    assert step51.clean_phrase('  The "Toolkit" for teachers. ') == "toolkit for teachers"
