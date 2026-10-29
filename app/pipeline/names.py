"""Name and location normalisation for matching organisations. Ported from EDA/Scripts/povezivanje.py (no pandas).

All functions return None for empty input. Normalised names are lower case, without diacritics or punctuation, with
Croatian abbreviations expanded (OŠ -> osnovna skola, SŠ -> srednja skola, DV -> djecji vrtic) and ordinal words turned
into Roman numerals ('Druga osnovna škola' -> 'ii. osnovna skola').
"""
import re
import unicodedata


def strip_diacritics(s: str) -> str:
    s = s.replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm_name(s):
    if s is None or not str(s).strip():
        return None
    s = strip_diacritics(str(s)).lower()
    s = re.sub(r"[\"'„“”«»˝`´]", "", s)
    s = re.sub(r"^o\.?\s*s\.?\s+", "osnovna skola ", s)
    s = re.sub(r"^s\.?\s*s\.?\s+", "srednja skola ", s)
    s = re.sub(r"^d\.?\s*v\.?\s+", "djecji vrtic ", s)
    s = re.sub(r"^l\.\s*", "i. ", s)                            # 'l.' (letter L) typed for 'I.'
    s = re.sub(r"^(prva|druga|treca|cetvrta)\b",
               lambda m: {"prva": "i.", "druga": "ii.", "treca": "iii.", "cetvrta": "iv."}[m.group(1)], s)
    s = re.sub(r"[.,;:()\-–/]", " ", s)
    return " ".join(s.split()) or None


def norm_place(s):
    if s is None or not str(s).strip():
        return None
    s = " ".join(strip_diacritics(str(s)).lower().split())
    return "zagreb" if s == "grad zagreb" else s


def strip_place(name, place):
    """Remove the place from the end of a normalised name ('... varazdin', '... grad varazdin')."""
    if not name or not place:
        return None
    for suffix in (f" grad {place}", f" {place}"):
        if name.endswith(suffix) and len(name) > len(suffix) + 3:
            return name[: -len(suffix)].strip()
    return None


def variants(raw, place):
    """Exact name variants of a beneficiary, most specific first: the part in parentheses, after or before ' - ' / ', '."""
    if raw is None:
        return []
    raw = str(raw)
    parts = []
    m = re.search(r"\((.+?)\)", raw)
    if m:
        parts.append(m.group(1))
    for sep in (" - ", " – ", ", "):
        if sep in raw:
            parts.append(raw.split(sep, 1)[1])
    if m:
        parts.append(raw[: m.start()])
    for sep in (" - ", " – ", ", "):
        if sep in raw:
            parts.append(raw.split(sep, 1)[0])
    out = []
    for p in parts:
        n = norm_name(p)
        for v in (n, strip_place(n, place)):
            if v and v not in out and len(v.split()) >= 2:
                out.append(v)
    return out


_POSTCODE = re.compile(r"(?:^|[^0-9])([0-9]{2} ?[0-9]{3})(?=[^0-9]|$)")


def parse_address(address):
    """(postcode, place) from a KA2 address like 'Street 1, 20350, METKOVIĆ'; either may be None.
    The place is the text after the last postcode, when there is one."""
    if not address:
        return None, None
    hits = list(_POSTCODE.finditer(address))
    if not hits:
        return None, None
    m = hits[-1]
    pc = m.group(1).replace(" ", "")
    tail = address[m.end():].strip(" ,;-")
    return pc, (tail or None)
