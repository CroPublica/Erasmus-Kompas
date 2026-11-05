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
    assert specs["ask_answer"].model == "qwen2.5:3b-instruct"      # the default tag of this model is already Q4_K_M


def test_concurrency_default_and_override(monkeypatch):
    assert max_concurrency() == 2
    monkeypatch.setenv("ATLAS_MAX_CONCURRENCY", "1")
    assert max_concurrency() == 1


def test_auto_profile_follows_the_gpu(monkeypatch):
    from atlas import config
    monkeypatch.delenv("ATLAS_PROFILE", raising=False)
    monkeypatch.setattr(config, "gpu_available", lambda: True)
    assert load_profile("auto")["ask_router"].model == load_profile("qwen3_4b_2507")["ask_router"].model
    monkeypatch.setattr(config, "gpu_available", lambda: False)
    assert load_profile("auto")["ask_answer"] == load_profile("cpu")["ask_answer"]


def test_force_cpu_overrides_a_present_gpu(monkeypatch):
    from atlas import config
    monkeypatch.setenv("ATLAS_FORCE_CPU", "1")
    assert config.gpu_available() is False
    monkeypatch.delenv("ATLAS_FORCE_CPU")
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "-1")
    assert config.gpu_available() is False


def test_thinking_switch_is_passed_to_the_chat_model():
    from atlas.config import make_chat_model
    assert make_chat_model("ask_answer", "qwen35").reasoning is False
    assert load_profile("light")["ask_answer"].think is None
