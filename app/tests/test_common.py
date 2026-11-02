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


def test_export_scrubs_email_addresses():
    import importlib.util, sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
    spec = importlib.util.spec_from_file_location("export70", Path(__file__).resolve().parent.parent / "pipeline" / "70_export_site.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    assert m.scrub("Write to erasmus.zena@gmail.com or a_b@x.hr.") == "Write to [e-mail removed] or [e-mail removed]."
    assert m.scrub("src=c_uq4j@group.calendar.google.com&x") == "src=[e-mail removed]&x"
    assert m.scrub(None) is None and m.scrub("no address here") == "no address here"
