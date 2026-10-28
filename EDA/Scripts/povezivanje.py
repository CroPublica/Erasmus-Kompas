"""Shared name/location matching of beneficiaries to the registers of educational
institutions, used by 17_link_registri_erasmus.py (National Agency project lists) and
19_link_ka2_registri.py (KA2 EU-wide file). The rules are described in 17's docstring:
exact matches after normalisation only, tiers 1-4, one institution per match.
"""
import re
import unicodedata

import pandas as pd

from nazivi_stupaca import CSV_ENCODING


def strip_diacritics(s):
    s = s.replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm_name(s):
    if pd.isna(s):
        return None
    s = strip_diacritics(str(s)).lower()
    s = re.sub(r"[\"'„“”«»˝`´]", "", s)
    s = re.sub(r"^o\.?\s*s\.?\s+", "osnovna skola ", s)       # OŠ / O.Š.
    s = re.sub(r"^s\.?\s*s\.?\s+", "srednja skola ", s)       # SŠ / S.Š.
    s = re.sub(r"^d\.?\s*v\.?\s+", "djecji vrtic ", s)        # DV / D.V.
    s = re.sub(r"^l\.\s*", "i. ", s)                           # 'l. osnovna škola' (letter L) -> 'I.'
    s = re.sub(r"^(prva|druga|treca|cetvrta)\b",                # 'Druga osnovna škola' -> 'II. osnovna škola'
               lambda m: {"prva": "i.", "druga": "ii.", "treca": "iii.", "cetvrta": "iv."}[m.group(1)], s)
    s = re.sub(r"[.,;:()\-–/]", " ", s)
    return " ".join(s.split()) or None


def norm_place(s):
    if pd.isna(s):
        return None
    s = " ".join(strip_diacritics(str(s)).lower().split())
    return "zagreb" if s == "grad zagreb" else s


def strip_place(name, place):
    """Remove the place name (and 'grad <place>') from the end of a normalised name."""
    if not name or not place:
        return None
    for suffix in (f" grad {place}", f" {place}"):
        if name.endswith(suffix) and len(name) > len(suffix) + 3:
            return name[: -len(suffix)].strip()
    return None


def variants(raw, place):
    """Exact name variants of a beneficiary, most specific first (tier 4)."""
    if pd.isna(raw):
        return []
    raw = str(raw)
    parts = []
    m = re.search(r"\((.+?)\)", raw)
    if m:
        parts.append(m.group(1))                       # inside parentheses (e.g. the faculty)
    for sep in [" - ", " – ", ", "]:
        if sep in raw:
            parts.append(raw.split(sep, 1)[1])         # after the separator
    if m:
        parts.append(raw[: m.start()])                 # before the parentheses
    for sep in [" - ", " – ", ", "]:
        if sep in raw:
            parts.append(raw.split(sep, 1)[0])         # before the separator
    out = []
    for p_ in parts:
        n = norm_name(p_)
        for v in (n, strip_place(n, place)):
            if v and v not in out and len(v.split()) >= 2:
                out.append(v)
    return out


def load_register(path):
    """ustanove_registar.csv with normalised keys and an institution id (schools in both
    school registers, i.e. same Šifra, are one institution)."""
    reg = pd.read_csv(path, encoding=CSV_ENCODING, dtype=str)
    reg["reg_id"] = range(len(reg))
    reg["n_name"] = reg["Naziv"].map(norm_name)
    reg["n_place"] = reg["Mjesto"].map(norm_place)
    reg["n_pc"] = reg["Poštanski broj"]
    reg["inst_id"] = ("S:" + reg["Šifra ustanove"]).where(reg["Šifra ustanove"].notna(),
                                                          "R:" + reg["reg_id"].astype(str))
    reg["n_name_noplace"] = [strip_place(n, pl) for n, pl in zip(reg["n_name"], reg["n_place"])]
    return reg


class Linker:
    def __init__(self, reg):
        keys = pd.concat([reg[["inst_id", "n_name", "n_place", "n_pc"]],
                          reg[["inst_id", "n_name_noplace", "n_place", "n_pc"]]
                          .rename(columns={"n_name_noplace": "n_name"})]).dropna(subset=["n_name"]).drop_duplicates()
        to_set = lambda s: sorted(set(s))
        self.by_name_pc = keys.dropna(subset=["n_pc"]).groupby(["n_name", "n_pc"])["inst_id"].apply(to_set).to_dict()
        self.by_name_place = keys.groupby(["n_name", "n_place"])["inst_id"].apply(to_set).to_dict()
        self.by_name = keys.groupby("n_name")["inst_id"].apply(to_set).to_dict()

    def link_name(self, name, place, pc):
        """Tiers 1-3 for one normalised name. Returns (inst_id | None, tier | reason)."""
        if pc is not None and not pd.isna(pc):
            hits = self.by_name_pc.get((name, pc), [])
            if len(hits) == 1:
                return hits[0], "1 name+postal"
            if len(hits) > 1:
                return None, "ambiguous"
        if place:
            hits = self.by_name_place.get((name, place), [])
            if len(hits) == 1:
                return hits[0], "2 name+place"
            if len(hits) > 1:
                return None, "ambiguous"
        hits = self.by_name.get(name, [])
        if len(hits) == 1:
            return hits[0], "3 unique name"
        if len(hits) > 1:
            return None, "name not unique, place/postal differ"
        return None, "no name match"

    def link(self, raw, name, place, pc):
        """Tiers 1-4. Returns (inst_id | None, tier | reason, matched normalised name)."""
        iid, tier = self.link_name(name, place, pc)
        if iid is not None or tier == "ambiguous":
            return iid, tier, name
        has_location = bool(place) or (pc is not None and not pd.isna(pc))
        for v in [strip_place(name, place)] + variants(raw, place):
            if not v or v == name:
                continue
            iid2, tier2 = self.link_name(v, place, pc)
            # a name variant may only link via postal code or place; the 'unique name' fallback is allowed
            # only when the row has no location at all (otherwise generic names such as 'Veleučilište'
            # link to an institution in another town)
            if iid2 is not None and (tier2 != "3 unique name" or not has_location):
                return iid2, "4 name variant (" + tier2[2:] + ")", v
        return None, tier, name
