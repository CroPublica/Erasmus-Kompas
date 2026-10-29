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
