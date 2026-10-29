import pytest

from atlas.config import ROLES, load_profile, max_concurrency


def test_default_profile_has_all_roles():
    specs = load_profile()
    assert set(ROLES) <= set(specs)


def test_ask_uses_qwen_in_light_profile():
    specs = load_profile("light")
    assert specs["ask_answer"].model == "qwen2.5:3b-instruct"
    assert specs["extraction"].model == "gemma4:latest"


def test_profile_from_environment(monkeypatch):
    monkeypatch.setenv("ATLAS_PROFILE", "gemma8b")
    assert load_profile()["ask_answer"].model == "gemma4:latest"


def test_unknown_profile_is_an_error():
    with pytest.raises(KeyError):
        load_profile("does-not-exist")


def test_cpu_profile_uses_multilingual_embeddings():
    specs = load_profile("cpu")
    assert specs["embeddings"].model == "bge-m3"
    assert "q4_K_M" in specs["ask_answer"].model


def test_concurrency_default_and_override(monkeypatch):
    assert max_concurrency() == 2
    monkeypatch.setenv("ATLAS_MAX_CONCURRENCY", "1")
    assert max_concurrency() == 1
