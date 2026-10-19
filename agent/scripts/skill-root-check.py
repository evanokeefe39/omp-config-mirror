#!/usr/bin/env python3
"""skill-root-check — assert the harness's own skills are actually being served.

Three skill roots exist on this machine and the arrangement is not obvious:

  ~/.omp/agent/skills   the harness repo. Authoritative, versioned. Loaded only
                        because `skills.customDirectories` names it in config.yml.
  ~/.agents/skills      a vendor root (Agent Skills convention, created 2026-04-14
                        by an unrelated installer, not a git repo). Loaded by the
                        `agents` provider via `skills.enableAgentsUser`.
  ~/.omp/skills         inert. Nothing scans it.

Until 2026-09-28 nothing scanned the repo root. Nine skills lived only there and
did not exist to the running agent, and an edit to a repo copy was a silent no-op
because the vendor root served a stale copy instead. Verified by dropping a
uniquely-named skill into each root: only `~/.agents/skills` resolved.

The fix is one line of config naming the repo root, and custom-directory skills
override same-named provider skills — so the repo copy is authoritative wherever a
name exists in both. That makes the config line the load-bearing part, and this
check exists for **the regression that would undo it**: if `customDirectories` is
dropped, the harness silently reverts to serving stale vendor copies.

Exit 1 if the repo root is not configured as a custom directory. Exit 0 otherwise;
the shadowed and unversioned sets are reported as context, because they are
housekeeping rather than breakage.

Usage:  python ~/.omp/agent/scripts/skill-root-check.py
"""

from __future__ import annotations

import os
import sys

AGENT_DIR = os.path.expanduser("~/.omp/agent")
CONFIG = os.path.join(AGENT_DIR, "config.yml")
REPO = os.path.join(AGENT_DIR, "skills")
VENDOR = os.path.expanduser("~/.agents/skills")
THIRD = os.path.expanduser("~/.omp/skills")


def skills_in(root: str) -> set[str]:
    """Skill directory names under `root`; empty set if the root does not exist."""
    if not os.path.isdir(root):
        return set()
    return {d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d))}


def configured_custom_dirs() -> list[str]:
    """`skills.customDirectories` as declared in config.yml, normalized.

    Parsed without a YAML dependency: the key's value is a list of quoted paths, and
    a regex over that block is enough for a check that must run anywhere.
    """
    import re

    if not os.path.isfile(CONFIG):
        return []
    text = open(CONFIG, encoding="utf-8").read()
    block = re.search(r"^skills:\n(.*?)(?=^\S)", text, re.M | re.S)
    if not block:
        return []
    listed = re.search(r"^[ \t]+customDirectories:\n((?:[ \t]*-[ \t]*.+\n)+)", block.group(1), re.M)
    if not listed:
        return []
    return [os.path.expanduser(p.strip().strip("\"'")) for p in
            re.findall(r"-[ \t]*(.+)", listed.group(1))]


def main() -> int:
    repo, vendor, third = skills_in(REPO), skills_in(VENDOR), skills_in(THIRD)
    print(f"  repo    {len(repo):>3}  {REPO}")
    print(f"  vendor  {len(vendor):>3}  {VENDOR}")
    print(f"  third   {len(third):>3}  {THIRD}   (inert)")

    dirs = configured_custom_dirs()
    print(f"\n  skills.customDirectories = {dirs}")

    # Compare normalized: os.path.join yields native separators, the config path may
    # carry either, and Windows is case-insensitive. A raw string compare reports
    # RED for a correctly configured root.
    def norm(p: str) -> str:
        return os.path.normcase(os.path.normpath(p))

    ok = any(norm(d) == norm(REPO) for d in dirs)
    if not ok:
        print("\nRED -- the repo root is NOT a configured custom directory.")
        print("     The harness falls back to the vendor root, where its skills are")
        print("     stale copies or absent entirely. Add to config.yml:")
        print(f'       skills:\n         customDirectories:\n           - "{REPO}"')
        return 1

    print("\nOK -- the repo root is configured and authoritative")
    shadowed = sorted(repo & vendor)
    if shadowed:
        print(f"\n  note: {len(shadowed)} skill(s) also exist in the vendor root and are shadowed by it (repo wins)")
    unversioned = sorted(vendor - repo)
    if unversioned:
        print(f"\n  note: {len(unversioned)} skill(s) exist ONLY in the vendor root -- no version history")
        print(f"        {', '.join(unversioned)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
