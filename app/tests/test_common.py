import pytest

import pipeline.common as common


def test_find_raw_matches_pattern_and_ignores_lock_files(tmp_path, monkeypatch):
    (tmp_path / "tablica_9_x.csv").write_text("a")
    (tmp_path / ".~lock.tablica_9_x.csv#").write_text("lock")
    monkeypatch.setattr(common, "RAW_DIR", tmp_path)
    assert common.find_raw("tablica_9_*.csv").name == "tablica_9_x.csv"


def test_find_raw_fails_when_ambiguous_or_missing(tmp_path, monkeypatch):
    (tmp_path / "a1.csv").write_text("")
    (tmp_path / "a2.csv").write_text("")
    monkeypatch.setattr(common, "RAW_DIR", tmp_path)
    with pytest.raises(FileNotFoundError):
        common.find_raw("a*.csv")
    with pytest.raises(FileNotFoundError):
        common.find_raw("zzz*.csv")
