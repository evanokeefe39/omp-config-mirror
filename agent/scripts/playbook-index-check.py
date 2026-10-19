#!/usr/bin/env python3
"""playbook-index-check — every playbook is indexed, and every indexed skill exists.

Two drifts, both silent by nature:

  invisible playbook   a `pb-*` skill is routable the moment its directory exists,
                       whether or not WORKFLOWS.md names it — the index quietly
                       stops being the menu.
  dangling row         a WORKFLOWS.md row names a skill that no longer exists —
                       the index sends its reader to a path that is gone.

Predicted by `example-ext/specs/SPEC.md` ("add a VERIFY.md check that
every `pb-*` skill appears in it and every playbook row in it exists as a skill …
poka-yoke against drift instead of duplication"), and built when the first playbook
landed (2026-09-30).

    python ~/.omp/agent/scripts/playbook-index-check.py [skills-dir] [workflows]

Exit 0 = every playbook is indexed and every indexed skill resolves.
Exit 1 = at least one is invisible or dangling.
"""

from __future__ import annotations

import os
import re
import sys

AGENT = os.path.expanduser("~/.omp/agent")
DEFAULT_SKILLS = os.path.join(AGENT, "skills")
DEFAULT_WORKFLOWS = os.path.join(AGENT, "WORKFLOWS.md")


def skill_dirs(root: str) -> list[str]:
    """Skill directory names carrying a SKILL.md; empty if the root is absent."""
    if not os.path.isdir(root):
        return []
    return sorted(d for d in os.listdir(root)
                  if os.path.isfile(os.path.join(root, d, "SKILL.md")))


def main() -> int:
    skills_dir = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SKILLS
    workflows = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_WORKFLOWS
    if not os.path.isfile(workflows):
        print(f"playbook-index-check: no such file: {workflows}")
        return 1
    with open(workflows, encoding="utf-8") as handle:
        text = handle.read()

    playbooks = [d for d in skill_dirs(skills_dir) if d.startswith("pb-")]
    referenced = sorted(set(re.findall(r"skills/([A-Za-z0-9][\w-]*)/", text)))

    print(f"playbook-index-check: {skills_dir}  +  {workflows}")
    print(f"  {len(playbooks)} playbook(s): {', '.join(playbooks) or 'none'}\n")

    fails = 0
    for name in playbooks:
        if name not in text:
            print(f"  FAIL  {name:<28} not indexed in WORKFLOWS.md")
            fails += 1
    for name in referenced:
        if not os.path.isfile(os.path.join(skills_dir, name, "SKILL.md")):
            print(f"  FAIL  skills/{name:<22} named by WORKFLOWS.md, but no SKILL.md on disk")
            fails += 1
    if fails:
        print(f"\n  {len(playbooks)} playbooks checked, {fails} problem(s)")
        print("  playbook index DRIFTED")
    else:
        print(f"  all {len(playbooks)} playbooks indexed, all {len(referenced)} indexed skills resolve")
        print("  playbook index OK")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
