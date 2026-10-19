#!/usr/bin/env python3
"""rule-frontmatter-check — catch rules that silently degrade.

A rule's frontmatter is parsed by OMP, and on failure the parser *falls back* to
line-by-line `key: value` reading. That fallback is why this class of defect is
invisible: an `alwaysApply: true` on its own line still survives, so a broken
rule keeps working well enough to look healthy.

Measured 2026-09-28, and the reason this exists: **2 of 24 rules failed parsing.**

  deeplinks.md        unquoted `: ` inside the description made YAML read a
                      nested mapping. Survived on the fallback — `alwaysApply`
                      was on its own line — so it was only *latently* broken.
  git-conventions.md  `\\'` inside a single-quoted scalar is not an escape in
                      YAML, so the string ended early and the parse died. The
                      `condition` was dropped, TTSR registration failed, and the
                      rule fell through to the rulebook — advisory only, while
                      reading as mechanically enforced.

The second is the shape to worry about: a rule that claims a mechanism it does
not have. And per `rulebook-matching-pipeline.md` §9.4, the parser's discovery
warnings are produced but never surfaced, so nothing tells you.

    python ~/.omp/agent/scripts/rule-frontmatter-check.py [rules-dir]

Exit 0 = every rule parses and is reachable. Exit 1 = at least one did not.
"""

from __future__ import annotations

import os
import re
import sys

DEFAULT_DIR = os.path.expanduser("~/.omp/agent/rules")
FRONTMATTER = re.compile(r"^---\n(.*?)\n---", re.S)


def check(path: str) -> list[tuple[str, str, str]]:
    """Return (status, message) pairs for one rule file."""
    out: list[tuple[str, str, str]] = []
    name = os.path.basename(path)
    try:
        text = open(path, encoding="utf-8", errors="replace").read()
    except OSError as exc:
        return [("FAIL", f"unreadable: {exc}", "")]

    m = FRONTMATTER.match(text)
    if not m:
        return [("FAIL", "no frontmatter block — rule loads with empty metadata", "")]

    raw = m.group(1)
    try:
        import yaml
    except ImportError:
        return [("FAIL", "PyYAML not importable — cannot check", "")]

    try:
        meta = yaml.safe_load(raw)
    except Exception as exc:
        first = str(exc).split("\n")[0][:60]
        return [("FAIL", f"frontmatter does not parse ({first}) — falls back to degraded line parsing", "")]

    if not isinstance(meta, dict):
        return [("FAIL", "frontmatter is not a mapping", "")]

    # Reachability, per rulebook-matching-pipeline.md §5 and §9.3: a rule with
    # neither a description, nor alwaysApply, nor a registrable condition joins no
    # bucket and is not addressable via rule:// at all.
    has_desc = bool(meta.get("description"))
    has_always = meta.get("alwaysApply") is True
    condition = meta.get("condition")
    if not (has_desc or has_always or condition):
        out.append(("FAIL", "no description, no alwaysApply, no condition — reachable by no bucket", ""))

    # A condition that cannot compile means TTSR registration fails and the rule
    # silently becomes a rulebook entry instead of a trigger.
    if condition:
        patterns = condition if isinstance(condition, list) else [condition]
        for pat in patterns:
            try:
                re.compile(str(pat))
            except re.error as exc:
                out.append(("FAIL", f"condition does not compile ({exc}) — TTSR registration will fail silently", ""))

    if not out:
        where = "condition" if condition else ("alwaysApply" if has_always else "rulebook")
        out.append(("PASS", f"parses; reachable via {where}", ""))
    return out


def main() -> int:
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DIR)
    if not os.path.isdir(root):
        print(f"rule-frontmatter-check: no such directory: {root}")
        return 1

    files = sorted(f for f in os.listdir(root)
                   if f.endswith((".md", ".mdc")) and os.path.isfile(os.path.join(root, f)))
    print(f"rule-frontmatter-check: {root}  ({len(files)} rules)\n")

    fails = 0
    for f in files:
        for status, msg, _ in check(os.path.join(root, f)):
            if status == "FAIL":
                fails += 1
                print(f"  FAIL  {f:<34} {msg}")
    if not fails:
        print(f"  all {len(files)} rules parse and are reachable")
    print(f"\n  {len(files) - fails} ok, {fails} failed")
    print("  rule frontmatter DEGRADED" if fails else "  rule frontmatter OK")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
