#!/usr/bin/env python3
"""Parse SYLLABUS.md -> data/syllabus.json  (SYLLABUS.md is the source of truth).
Run:  python tools/build-syllabus.py
"""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
md = (root / "SYLLABUS.md").read_text(encoding="utf-8").splitlines()

ICONS = {"m1": "⚖️", "m2": "🧭", "m3": "📦", "m4": "🤝", "m5": "🏦", "m6": "🪙", "m7": "🏰", "m8": "🐪", "m9": "⛵"}
SHORT = {"m1": "Economic Administration", "m2": "Global Trade Network", "m3": "Exports & Imports",
         "m4": "Guilds & Regulation", "m5": "Banking & Finance", "m6": "Money & Ethics",
         "m7": "Mauryan State & Trade", "m8": "Kushanas & Silk Route", "m9": "Maritime Trade"}

modules = {}
order = []
for line in md:
    m = re.match(r"\|\s*(M\d)\s*\|\s*(\d+)\s*\|\s*(.+?)\s*\|", line)
    if m:
        mid = m.group(1).lower()
        modules[mid] = {"id": mid, "n": int(mid[1:]), "session": int(m.group(2)), "title": m.group(3),
                        "short": SHORT[mid], "icon": ICONS[mid], "topics": []}
        order.append(mid)

cur = None
clean = lambda s: re.sub(r"\*\*|\*|`", "", s).strip()
for line in md:
    t = re.match(r"^\*\*(m\d+)-(t\d+) (.+?)\*\*\s*$", line)
    if t:
        mid = t.group(1)
        cur = {"id": f"{mid}-{t.group(2)}", "title": clean(t.group(3)), "notes": []}
        modules[mid]["topics"].append(cur)
        continue
    if line.startswith("## ") or line.startswith("---"):
        cur = None
        continue
    if cur is not None and re.match(r"^\s*- ", line):
        cur["notes"].append(clean(re.sub(r"^\s*- ", "", line)))

out = {"version": 1, "modules": [modules[m] for m in order]}
(root / "data").mkdir(exist_ok=True)
(root / "data" / "syllabus.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
nt = sum(len(m["topics"]) for m in out["modules"])
print(f"{len(out['modules'])} modules, {nt} topics -> data/syllabus.json")
for m in out["modules"]:
    print(f"  {m['id']}: {len(m['topics'])} topics - {m['title']}")
