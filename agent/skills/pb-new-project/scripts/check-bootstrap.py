#!/usr/bin/env python3
"""check-bootstrap — did this scope actually get bootstrapped, or just created?

Run it against a **fresh clone** of a new scope, not the working tree: the clone
is what the next person gets. Every item below is something that was missing from
a real scope in ~/repos (README 117/160, LICENSE 51/160, AGENTS.md 47/160), so
each one is a check that has already gone red in production, not a hypothetical.

    python ~/.omp/agent/skills/pb-new-project/scripts/check-bootstrap.py <path>

Exit 0 = every FAIL item passed. Exit 1 = at least one failed. WARN items do not
set the exit code — they are real but scope-dependent.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys

PASS, FAIL, WARN = "PASS", "FAIL", "WARN"
results: list[tuple[str, str, str]] = []

# release-type -> the file that strategy bumps (release-please README, release-type
# table). Types not listed get a WARN rather than a guessed path.
VERSION_FILES = {
    "simple": "version.txt",
    "python": "pyproject.toml",
    "node": "package.json",
    "rust": "Cargo.toml",
    "php": "composer.json",
    "dart": "pubspec.yaml",
    "helm": "Chart.yaml",
}


def record(status: str, item: str, detail: str = "") -> None:
    results.append((status, item, detail))


def git(root: str, *args: str) -> tuple[int, str]:
    """Run git in `root`; return (exit code, stdout)."""
    try:
        p = subprocess.run(["git", "-C", root, *args], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=30)
        return p.returncode, (p.stdout or "").strip()
    except Exception as exc:  # git absent, timeout, unreadable repo
        return 1, str(exc)


def tracking_section(text: str) -> str:
    """The `## Tracking` section of AGENTS.md, or the whole file when it has none.

    Scoping the prefix search keeps a short prefix from matching prose elsewhere:
    a 2-4 letter prefix appears in ordinary words often enough to pass for the
    wrong reason.
    """
    head = re.search(r"^#{1,6}[ \t]+Tracking[ \t]*$", text, flags=re.M)
    if head is None:
        return text
    rest = text[head.end():]
    nxt = re.search(r"^#{1,6}[ \t]+\S", rest, flags=re.M)
    return rest[:nxt.start()] if nxt else rest


def main() -> int:
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
    print(f"check-bootstrap: {root}\n")
    if not os.path.isdir(root):
        print(f"FAIL  path is not a directory")
        return 1

    # --- is it a repo at all -------------------------------------------------
    code, _ = git(root, "rev-parse", "--git-dir")
    if code != 0:
        record(FAIL, "is a git repository", "git rev-parse --git-dir failed")
        report()
        return 1
    record(PASS, "is a git repository")

    # --- linear history: no merge commits ------------------------------------
    code, merges = git(root, "rev-list", "--merges", "--count", "HEAD")
    if code != 0:
        record(WARN, "has at least one commit", "unborn HEAD — nothing committed yet")
    else:
        count = git(root, "rev-list", "--count", "HEAD")[1]
        record(PASS, "has at least one commit", f"{count} commit(s)")
        if merges.strip() == "0":
            record(PASS, "linear history", "no merge commits")
        else:
            record(FAIL, "linear history", f"{merges.strip()} merge commit(s) — squash-merge instead")

    # --- founding documents --------------------------------------------------
    readme = os.path.join(root, "README.md")
    if not os.path.isfile(readme):
        record(FAIL, "README.md exists", "missing")
    else:
        text = open(readme, encoding="utf-8", errors="replace").read()
        body = re.sub(r"^#.*$", "", text, flags=re.M).strip()
        # a title alone is a placeholder, not a README; the standard asks for
        # what/why/how — three sentences is roughly this much body text.
        if len(body) < 120:
            record(FAIL, "README.md says something", f"{len(body)} chars of body after headings — a title is not a README")
        else:
            record(PASS, "README.md says something", f"{len(body)} chars of body")

    lic = next((f for f in ("LICENSE", "LICENSE.md", "LICENSE.txt")
                if os.path.isfile(os.path.join(root, f))), None)
    if lic:
        size = os.path.getsize(os.path.join(root, lic))
        record(PASS if size > 400 else FAIL, f"{lic} is a real licence",
               "" if size > 400 else f"only {size} bytes — a stub, not a licence")
    else:
        record(FAIL, "LICENSE exists", "no LICENSE, LICENSE.md or LICENSE.txt")

    if os.path.isfile(os.path.join(root, "AGENTS.md")):
        record(PASS, "AGENTS.md exists")
    else:
        record(FAIL, "AGENTS.md exists", "the scope declares nothing about itself")

    if os.path.isfile(os.path.join(root, ".gitignore")):
        record(PASS, ".gitignore exists")
    else:
        record(FAIL, ".gitignore exists", "artefacts will be committed by accident")

    if os.path.isdir(os.path.join(root, "docs")):
        record(PASS, "docs/ exists")
    else:
        record(FAIL, "docs/ exists", "no place for anything longer than a README")

    # --- ledgers (imp-setup) -------------------------------------------------
    ledgers = [n for n in ("DEFECTS.md", "IMPROVEMENTS.md", "FEEDBACK.md", "VERIFY.md")
               if os.path.isfile(os.path.join(root, n))]
    if len(ledgers) >= 2:
        record(PASS, "ledgers established", ", ".join(ledgers))
    elif ledgers:
        record(WARN, "ledgers established", f"only {', '.join(ledgers)} — imp-setup writes four")
    else:
        # pb-new-project's scaffold phase runs imp-setup unconditionally
        record(FAIL, "ledgers established", "none - run skill://imp-setup")

    # --- toolchain, only if there is code ------------------------------------
    pyproject = os.path.join(root, "pyproject.toml")
    if not os.path.isfile(pyproject):
        record(WARN, "toolchain", "no pyproject.toml — fine for a non-code scope")
    else:
        record(PASS if os.path.isfile(os.path.join(root, "uv.lock")) else FAIL,
               "uv.lock committed", "" if os.path.isfile(os.path.join(root, "uv.lock")) else "pyproject without a lockfile")
        record(PASS if os.path.isdir(os.path.join(root, ".venv")) else WARN,
               ".venv present", "" if os.path.isdir(os.path.join(root, ".venv")) else "run `uv sync`")
        gi = os.path.join(root, ".gitignore")
        ignored = os.path.isfile(gi) and ".venv" in open(gi, encoding="utf-8", errors="replace").read()
        record(PASS if ignored else FAIL, ".venv is gitignored", "" if ignored else "a virtualenv must never be committed")

    # --- git files every repo gets (skill://git-conventions `## Repo files`) ----
    for rel, why in (("CONTRIBUTING.md", "humans get no statement of the branch/commit/PR rules"),
                     (".github/workflows/pr-title.yml", "a non-conventional PR title can reach main and mis-set the version")):
        present = os.path.isfile(os.path.join(root, rel))
        record(PASS if present else FAIL, f"{rel} exists", "" if present else why)

    # --- tracking (skill://backlog-conventions, pb-new-project backlog phase) --
    agents = os.path.join(root, "AGENTS.md")
    agents_text = open(agents, encoding="utf-8", errors="replace").read() if os.path.isfile(agents) else ""
    prefix = ""
    cfg = os.path.join(root, "backlog", "config.yml")
    if not os.path.isfile(cfg):
        record(FAIL, "backlog config exists",
               "no backlog/config.yml - `backlog init` per skill://backlog-conventions `## Setting up a repo`")
    else:
        m = re.search(r"^task_prefix:[ \t]*(\S+)[ \t]*$",
                      open(cfg, encoding="utf-8", errors="replace").read(), flags=re.M)
        value = m.group(1).strip("\"'") if m else ""
        if re.fullmatch(r"[A-Za-z]{1,4}", value):
            prefix = value
            record(PASS, "backlog task prefix", f"`{prefix}` in backlog/config.yml")
        elif value:
            record(FAIL, "backlog task prefix",
                   f"`{value}` is not 1-4 letters - the CLI refuses to change it later, so pick a prefix before init")
        else:
            record(FAIL, "backlog task prefix", "backlog/config.yml declares no `task_prefix:`")

    # the prefix must be written down where the next reader looks for it
    mentioned = bool(prefix) and re.search(rf"\b{re.escape(prefix)}\b", tracking_section(agents_text),
                                           flags=re.I) is not None
    record(PASS if mentioned else FAIL, "prefix recorded in AGENTS.md",
           f"`{prefix}` under `## Tracking`" if mentioned
           else "no valid prefix to record - fix the item above" if not prefix
           else f"`{prefix}` is not under `## Tracking` - record the prefix, the path `backlog/` and skill://backlog-conventions")

    # --- release profile (skill://git-conventions `## Releases`) ---------------
    profile = re.search(r"Release profile:\s*`?(package|continuous)`?(.*)", agents_text)
    if not profile:
        record(FAIL, "release profile declared", "AGENTS.md has no `Release profile: package|continuous` line")
    elif profile.group(1) == "continuous":
        # continuous is an opt-out from the package default, so it carries its reason
        reason = re.sub(r"^[\s\-\u2013\u2014:.,]+", "", profile.group(2)).strip()
        record(PASS if reason else WARN, "release profile declared",
               "continuous, no release-please" if reason else "continuous with no reason - state why on the same line")
    else:
        record(PASS, "release profile declared", "package")
        # every release file git-conventions `## Repo files` lists for a package;
        # a missing one means the release PR never opens, which no other check
        # would notice. CHANGELOG.md is deliberately absent: release-please
        # creates it on the first release, and a pre-made one is mangled.
        for rel in ("release-please-config.json", ".release-please-manifest.json",
                    ".github/workflows/release-please.yml"):
            present = os.path.isfile(os.path.join(root, rel))
            record(PASS if present else FAIL, f"release-please: {rel}",
                   "" if present else "package profile without it - see skill://git-conventions Repo files")
        # the version file the release type reads must exist, or release-please
        # has nothing to bump (git-conventions `## Repo files`, "the version file")
        cfg_path = os.path.join(root, "release-please-config.json")
        try:
            cfg = json.load(open(cfg_path, encoding="utf-8")) if os.path.isfile(cfg_path) else {}
            rtype = (cfg.get("packages", {}).get(".", {}) or {}).get("release-type") or cfg.get("release-type")
        except (OSError, ValueError) as exc:
            rtype = None
            record(FAIL, "release-please config parses", str(exc))
        if rtype in VERSION_FILES:
            vf = VERSION_FILES[rtype]
            present = os.path.isfile(os.path.join(root, vf))
            record(PASS if present else FAIL, f"version file for `{rtype}`",
                   vf if present else f"{vf} missing - release-please has nothing to bump")
        elif rtype:
            record(WARN, "version file", f"release-type `{rtype}` not mapped here - check its version file by hand")
        # the template's publish job carries a placeholder step that must not ship
        wf = os.path.join(root, ".github", "workflows", "release-please.yml")
        if os.path.isfile(wf):
            leftover = 'echo "publish' in open(wf, encoding="utf-8", errors="replace").read()
            record(FAIL if leftover else PASS, "release-please publish job is real or deleted",
                   "the template's placeholder `echo \"publish ...\"` step is still there" if leftover else "")

    return report()


def report() -> int:
    width = max(len(i) for _, i, _ in results)
    for status, item, detail in results:
        line = f"  {status:<4}  {item:<{width}}"
        if detail:
            line += f"  {detail}"
        print(line.rstrip())
    fails = sum(1 for s, _, _ in results if s == FAIL)
    warns = sum(1 for s, _, _ in results if s == WARN)
    print(f"\n  {len(results) - fails - warns} passed, {fails} failed, {warns} warned")
    print("  bootstrap INCOMPLETE" if fails else "  bootstrap OK")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
