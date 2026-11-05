"""English concept labels as the language model wrote them are lower case ("use of ict tools in teaching"); answers show them as readable text."""
from __future__ import annotations

import re

# Written out when they stand alone in a label, so a reader who does not know the abbreviation still understands the answer.
_SPELLED = {
    "ict": "information and communication technology (ICT)",
    "ltta": "learning, teaching and training activities (LTTA)",
    "ltt": "learning, teaching and training (LTT)",
}
_CASED = {"neets": "NEETs", "smes": "SMEs", "heis": "HEIs", "moocs": "MOOCs", "ngos": "NGOs"}
_ABBR = "vet|stem|clil|mooc|moocs|ngos|ngo|ai|lgbt|oer|heis|hei|sen|smes|sme|neets"
# The label already spells the abbreviation out: only the wording and the case are fixed.
_PAREN_FULL = {"learning teaching activities (ltta)": "Learning, teaching and training activities (LTTA)"}


def _up(k: str) -> str:
    return _CASED.get(k, k.upper())


def pretty_en(label: str | None) -> str:
    """'use of ict tools in teaching' -> 'Use of information and communication technology (ICT) tools in teaching'. Labels that already have capitals are kept."""
    s = (label or "").strip()
    if not s or s != s.lower():
        return s
    if s in _PAREN_FULL:
        return _PAREN_FULL[s]
    # "(ltta)" after words that do not spell it out: the abbreviation only, in capitals
    s = re.sub(r"\((ltta|ltt|mooc|moocs|oer|clil|heis|sen|neets)\)", lambda m: f"({_up(m.group(1))})", s)
    s = re.sub(r"(?<![\w(])(ict|ltta|ltt)(?![\w)])", lambda m: _SPELLED[m.group(1)], s)
    s = re.sub(rf"(?<![\w(-])({_ABBR})(?![\w)])", lambda m: _up(m.group(1)), s)
    s = re.sub(r"\bit skills\b", "IT skills", s)
    return s[0].upper() + s[1:]
