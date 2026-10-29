"""Shared paths and helpers for the pipeline steps."""
import hashlib
import os
import unicodedata
from pathlib import Path

import duckdb

APP_DIR = Path(__file__).resolve().parent.parent
# Raw files (data.gov.hr downloads + Erasmus+ Project Results Platform exports). Not in git: they are large.
# Default: the folder `data/` next to the repository; override with ATLAS_RAW_DIR.
RAW_DIR = Path(os.environ.get("ATLAS_RAW_DIR", APP_DIR.parent.parent / "data")).expanduser()
DB_PATH = Path(os.environ.get("ATLAS_DB", APP_DIR / "data" / "atlas.duckdb")).expanduser()


def find_raw(pattern: str) -> Path:
    """The single raw file matching a glob pattern relative to RAW_DIR (tolerates NFC/NFD file names)."""
    folder, _, name_pat = pattern.rpartition("/")
    base = RAW_DIR / folder if folder else RAW_DIR
    if not base.is_dir():
        raise FileNotFoundError(f"raw folder not found: {base}  (set ATLAS_RAW_DIR)")
    import fnmatch
    want = unicodedata.normalize("NFC", name_pat)
    hits = [p for p in base.iterdir()
            if fnmatch.fnmatch(unicodedata.normalize("NFC", p.name), want) and not p.name.startswith(".~lock")]
    if len(hits) != 1:
        raise FileNotFoundError(f"expected exactly one file matching {pattern!r} in {base}, found {len(hits)}: "
                                f"{[h.name for h in hits]}")
    return hits[0]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def connect(read_only: bool = False) -> duckdb.DuckDBPyConnection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return duckdb.connect(str(DB_PATH), read_only=read_only)


def table_exists(con, name: str) -> bool:
    return con.execute("select count(*) from information_schema.tables where table_name = ?", [name]).fetchone()[0] > 0


def find_col(con, table: str, prefix: str) -> str:
    """Name of the column in `table` that starts with `prefix` (raw headers contain apostrophes and long notes)."""
    cols = [r[0] for r in con.execute(f'describe "{table}"').fetchall()]
    hits = [c for c in cols if c.startswith(prefix)]
    if len(hits) != 1:
        raise KeyError(f"{table}: expected one column starting with {prefix!r}, found {hits}")
    return hits[0]
