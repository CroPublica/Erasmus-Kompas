"""Country names for Erasmus+ codes (EL = Greece, UK = United Kingdom), in English and Croatian."""
NAMES = {  # code: (English, Croatian)
    "AT": ("Austria", "Austrija"), "BE": ("Belgium", "Belgija"), "BG": ("Bulgaria", "Bugarska"), "CY": ("Cyprus", "Cipar"),
    "CZ": ("Czechia", "Češka"), "DE": ("Germany", "Njemačka"), "DK": ("Denmark", "Danska"), "EE": ("Estonia", "Estonija"),
    "EL": ("Greece", "Grčka"), "ES": ("Spain", "Španjolska"), "FI": ("Finland", "Finska"), "FR": ("France", "Francuska"),
    "HR": ("Croatia", "Hrvatska"), "HU": ("Hungary", "Mađarska"), "IE": ("Ireland", "Irska"), "IT": ("Italy", "Italija"),
    "LT": ("Lithuania", "Litva"), "LU": ("Luxembourg", "Luksemburg"), "LV": ("Latvia", "Latvija"), "MT": ("Malta", "Malta"),
    "NL": ("Netherlands", "Nizozemska"), "PL": ("Poland", "Poljska"), "PT": ("Portugal", "Portugal"), "RO": ("Romania", "Rumunjska"),
    "SE": ("Sweden", "Švedska"), "SI": ("Slovenia", "Slovenija"), "SK": ("Slovakia", "Slovačka"),
    "AL": ("Albania", "Albanija"), "BA": ("Bosnia and Herzegovina", "Bosna i Hercegovina"), "IS": ("Iceland", "Island"),
    "LI": ("Liechtenstein", "Lihtenštajn"), "MK": ("North Macedonia", "Sjeverna Makedonija"), "NO": ("Norway", "Norveška"),
    "RS": ("Serbia", "Srbija"), "TR": ("Türkiye", "Turska"), "UK": ("United Kingdom", "Ujedinjena Kraljevina"),
    "ME": ("Montenegro", "Crna Gora"), "XK": ("Kosovo", "Kosovo"), "CH": ("Switzerland", "Švicarska"), "UA": ("Ukraine", "Ukrajina"),
    "MD": ("Moldova", "Moldova"), "GE": ("Georgia", "Gruzija"), "AM": ("Armenia", "Armenija"), "AZ": ("Azerbaijan", "Azerbajdžan"),
    "MA": ("Morocco", "Maroko"), "TN": ("Tunisia", "Tunis"), "EG": ("Egypt", "Egipat"), "IL": ("Israel", "Izrael"),
}


def country_name(code: str, lang: str) -> str:
    n = NAMES.get(code)
    return (n[1] if lang == "hr" else n[0]) if n else code


def countries_in_text(text: str) -> list[str]:
    """Erasmus+ codes of the countries named in a question, in the order they appear (Croatian case endings and English names)."""
    import re
    from atlas.tools import _fold
    low = _fold(text)
    found = []
    for code, (en, hr) in NAMES.items():
        h = _fold(hr)
        stem = h[:-1] if h[-1] in "aeiou" and len(h) > 4 else h
        for pat in (rf"(?<![a-z]){re.escape(stem)}\w{{0,3}}(?![a-z])", rf"(?<![a-z]){re.escape(_fold(en))}(?![a-z])"):
            m = re.search(pat, low)
            if m:
                found.append((m.start(), code)); break
    return [c for _, c in sorted(found)]
