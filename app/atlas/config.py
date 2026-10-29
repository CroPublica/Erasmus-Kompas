"""Model configuration: reads config/models.yaml and builds LangChain chat/embedding models by role."""
import os
from pathlib import Path
from typing import Literal, Optional

import yaml
from pydantic import BaseModel

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "config" / "models.yaml"
ROLES = ("ask_router", "ask_answer", "extraction", "translation", "embeddings")


class ModelSpec(BaseModel):
    provider: Literal["ollama", "openai"]
    model: str
    temperature: float = 0.0
    num_ctx: Optional[int] = None
    think: Optional[bool] = None       # thinking models (Qwen3.5): False turns the reasoning phase off; None leaves the model default
    base_url: Optional[str] = None


def gpu_available() -> bool:
    """True when a GPU that Ollama can use is present: NVIDIA (nvidia-smi lists one) or Apple silicon. ATLAS_FORCE_CPU=1 or
    CUDA_VISIBLE_DEVICES=-1 forces CPU. Ollama itself falls back to CPU, so this only decides which models to ask for."""
    import platform, shutil, subprocess
    if os.environ.get("ATLAS_FORCE_CPU") == "1" or os.environ.get("CUDA_VISIBLE_DEVICES") == "-1":
        return False
    if platform.system() == "Darwin" and platform.machine() == "arm64":
        return True
    if shutil.which("nvidia-smi"):
        try:
            return bool(subprocess.run(["nvidia-smi", "-L"], capture_output=True, text=True, timeout=10).stdout.strip())
        except Exception:                                  # noqa: BLE001
            return False
    return False


def load_profile(profile: Optional[str] = None, path: Path = DEFAULT_PATH) -> dict[str, ModelSpec]:
    """Return {role: ModelSpec} for a profile (argument > ATLAS_PROFILE > active_profile in the file)."""
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    name = profile or os.environ.get("ATLAS_PROFILE") or raw["active_profile"]
    if name == "auto":                                     # GPU present -> "light", otherwise the CPU profile
        name = "light" if gpu_available() else "cpu"
    if name not in raw["profiles"]:
        raise KeyError(f"profile {name!r} not in {path}; available: {sorted(raw['profiles'])}")
    specs = {role: ModelSpec(**cfg) for role, cfg in raw["profiles"][name].items()}
    missing = [r for r in ROLES if r not in specs]
    if missing:
        raise ValueError(f"profile {name!r} lacks roles: {missing}")
    return specs


def max_concurrency(path: Path = DEFAULT_PATH) -> int:
    """Parallel LLM requests allowed (ATLAS_MAX_CONCURRENCY overrides runtime.max_concurrency)."""
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return int(os.environ.get("ATLAS_MAX_CONCURRENCY") or raw.get("runtime", {}).get("max_concurrency", 2))


def _ollama_url(spec: ModelSpec) -> str:
    return spec.base_url or os.environ.get("ATLAS_OLLAMA_URL", "http://127.0.0.1:11434")


def make_chat_model(role: str, profile: Optional[str] = None):
    """LangChain chat model for a role (imports the provider package only when called)."""
    spec = load_profile(profile)[role]
    if spec.provider == "ollama":
        from langchain_ollama import ChatOllama
        extra = {"num_ctx": spec.num_ctx} if spec.num_ctx else {}
        if spec.think is not None:
            extra["reasoning"] = spec.think
        return ChatOllama(model=spec.model, base_url=_ollama_url(spec), temperature=spec.temperature, **extra)
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(model=spec.model, base_url=spec.base_url, temperature=spec.temperature,
                      api_key=os.environ.get("ATLAS_OPENAI_API_KEY", "not-needed"))


def make_embeddings(profile: Optional[str] = None):
    spec = load_profile(profile)["embeddings"]
    if spec.provider != "ollama":
        raise NotImplementedError("embeddings are served through Ollama in this project")
    from langchain_ollama import OllamaEmbeddings
    return OllamaEmbeddings(model=spec.model, base_url=_ollama_url(spec))
