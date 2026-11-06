"""The site must show a name for everything the API and the data can hand it, never a raw code or English wording.
These tests compare the label tables in the site code with what the code and the data can produce."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import get_args

import pytest

APP = Path(__file__).resolve().parents[1]
EK = APP / "site" / "src" / "ek"
DATA = APP / "site" / "src" / "data"


def js(name: str) -> str:
    return (EK / name).read_text(encoding="utf-8")


def keys_of(src: str, const: str) -> set[str]:
    """Keys of `const NAME = { key: [...], ... };` in a JS file."""
    start = src.index(f"const {const} = {{")
    end = src.index("};", start)
    return set(re.findall(r"(?:^|[{,\s])'?([A-Za-z_][\w-]*)'?\s*:\s*\[", src[start:end]))


def test_every_assistant_route_has_a_name():
    from atlas.ask import Route
    missing = set(get_args(Route)) - keys_of(js("assistant.js"), "ROUTE_NAME")
    assert not missing, f"routes without a label in assistant.js ROUTE_NAME: {sorted(missing)}"


def test_every_tool_has_a_name():
    tools = set(re.findall(r'ToolResult\(\s*"([a-z_]+)"', (APP / "atlas" / "tools.py").read_text(encoding="utf-8")))
    assert tools, "no tools found"
    missing = tools - keys_of(js("assistant.js"), "TOOL_NAME")
    assert not missing, f"tools without a label in assistant.js TOOL_NAME: {sorted(missing)}"


def test_every_tool_argument_has_a_name():
    src = (APP / "atlas" / "tools.py").read_text(encoding="utf-8")
    args = set()
    for m in re.finditer(r'ToolResult\(\s*"[a-z_]+",\s*\{([^}]*)\}', src):
        args |= set(re.findall(r'"([a-z_]+)"\s*:', m.group(1)))
    args |= set(re.findall(r'res\.args\["([a-z_]+)"\]\s*=', src))               # arguments added later, e.g. res.args["by_meaning"] = True
    assert args, "no arguments found"
    missing = args - keys_of(js("assistant.js"), "ARG_NAME")
    assert not missing, f"arguments without a label in assistant.js ARG_NAME: {sorted(missing)}"


@pytest.mark.skipif(not (DATA / "orgs.json").exists(), reason="site data not exported")
def test_every_organisation_class_has_a_label():
    classes = {o["cls"] for o in json.loads((DATA / "orgs.json").read_text(encoding="utf-8")) if o.get("cls")}
    nat = json.loads((DATA / "national.json").read_text(encoding="utf-8"))
    for per in nat["periods"].values():
        classes |= {c["org_class"] for c in per.get("classes", []) if c.get("org_class")}
    labelled = set(re.findall(r"(\w+):\s*'[^']+'", js("core.js")[js("core.js").index("  cls: {"):].split("\n", 1)[0]))
    missing = classes - labelled
    assert not missing, f"organisation classes without a label in core.js LAB.cls: {sorted(missing)}"


@pytest.mark.skipif(not (DATA / "orgs_full.json").exists(), reason="site data not exported")
def test_every_project_type_has_a_croatian_name():
    full = json.loads((DATA / "orgs_full.json").read_text(encoding="utf-8"))
    types = {" ".join(p["type"].split()) for o in full.values() for p in o["projects"] if p.get("type")}
    block = js("views.js")
    named = json.loads(re.search(r"const PROJECT_TYPE_HR = (\{.*?\});", block, re.S).group(1))
    missing = types - set(named)
    assert not missing, f"project types without a Croatian name in views.js PROJECT_TYPE_HR: {sorted(missing)}"


def test_no_file_names_in_text_shown_to_people():
    for name in ("views.js", "views2.js", "pages.js", "assistant.js"):
        for n, line in enumerate(js(name).splitlines(), 1):
            if "orgs_full.json" in line or "projects_full.json" in line:
                assert re.match(r"\s*(/\*|//|\*)", line) or "find('" in line or "FULL" in line or "pipeline ih generira" in line, f"{name}:{n} shows a file name to people"
