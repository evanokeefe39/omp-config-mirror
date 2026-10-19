#!/usr/bin/env python3
"""herdr-skill-check — the herdr standard cannot name a command or a path that is gone.

`skill://herdr-conventions` and `rule://herdr-conventions` deliberately copy no CLI
*names*: they point at the installed binary for the surface and quote the exact
invocations the house uses. That is the right shape — the vendor surface is
version-pinned, and a copied flag is a fact with no owner — but it moves the drift
somewhere quieter. A herdr update that renames `agent start`, or a repo file that
moves, leaves the standard naming something that no longer exists, and prose cannot
fail.

What they do copy — the agent-state semantics, the ID shape, the gate, the flag
block — is prose this check cannot see: a change to a flag's meaning or to a state's
meaning passes green, and only a renamed group, subcommand or path fails.

So the check reads the source files below and holds them against reality:

  * every `herdr <group>` they name resolves (`herdr <group> --help` exits 0);
  * every `<group> <subcommand>` they name is *listed* by that group's own help —
    the leaf command is never executed, because several of them mutate
    (`herdr workspace create` is valid with defaults, `herdr integration install`
    writes a file);
  * every repo-relative path the standard names exists, plus its source files and
    this script;
  * `omp --help` still lists `--cwd`, which the skill tells a session to use.

The files are the source of the command list, never a list kept here: a hardcoded
list would pass forever while the prose rotted.

Usage:  python agent/scripts/herdr-skill-check.py     (from the harness root)

Exit 0 = every named command and path resolves. Exit 1 = the first one that does
not, named. Requires neither `HERDR_ENV` nor a running herdr server.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

SOURCES = (
    "agent/skills/herdr-conventions/SKILL.md",
    "agent/rules/herdr-conventions.md",
)

# The other owners of herdr invocations. The standard calls itself the house
# standard, so a rename has to fail here too, not only where it was first written.
# Their path-shaped tokens are deliberately not asserted: they name files in other
# repos (`HANDOFF.md`, `~/workspace/<repo>`), not paths in this one.
COMMAND_SOURCES = (
    "agent/skills/handoff/SKILL.md",
    "agent/skills/deploy-agent/SKILL.md",
    "agent/skills/deploy-agent/references/dispatch.md",
    "agent/skills/dispatch/SKILL.md",
)

# Option-only forms (`herdr --skill`, `herdr --help`) carry no command to resolve.
OPTION_ONLY = ("-",)

FENCED = re.compile(r"```[^\n]*\n(.*?)```", re.S)
# `[^`]+`, not `[^`\n]+`: a long invocation wraps inside one span
# (`` `herdr worktree\nopen` ``), and excluding the newline silently drops it.
INLINE = re.compile(r"`([^`]+)`", re.S)
PATH_SHAPE = re.compile(r"^[A-Za-z0-9._/-]+$")


def unfenced(text: str) -> str:
    """The text with every fenced block replaced, so its backticks cannot pair."""
    return FENCED.sub("\n", text)


def spans(text: str) -> list[str]:
    """Every fenced block body and every inline backticked span, in file order."""
    return [m.group(1) for m in FENCED.finditer(text)] + INLINE.findall(unfenced(text))


def is_placeholder(tok: str) -> bool:
    """A metavariable (`<name>`, `<group>`, `…`), not something to resolve."""
    return any(c in tok for c in "<>…") or tok == "..."


def invocations(text: str) -> set[tuple[str, str | None]]:
    """Every `herdr <group> [<sub>]` the text names, as (group, subcommand | None).

    One flat token stream per span, anchored on the literal `herdr`: a span may
    hold a whole fenced block of invocations, or a single one wrapped across a
    line, and both must yield the same commands.
    """
    found: set[tuple[str, str | None]] = set()
    for span in spans(text):
        toks = span.split()
        for i, tok in enumerate(toks):
            # Bare `herdr` launches or attaches the TUI — never probe it, so a
            # span with no token after it yields nothing.
            if tok != "herdr" or i + 1 >= len(toks):
                continue
            group = toks[i + 1]
            if group.startswith(OPTION_ONLY) or is_placeholder(group):
                continue
            sub = None
            for nxt in toks[i + 2:]:
                if nxt == "herdr":
                    break
                if nxt.startswith(OPTION_ONLY) or is_placeholder(nxt):
                    continue
                sub = nxt
                break
            found.add((group, sub))
    return found


def is_repo_path(tok: str) -> bool:
    """A repo-relative file path, not a URL, a skill URI, an ID or a metavariable."""
    if "://" in tok or "/" not in tok or tok.startswith("/"):
        return False
    if not PATH_SHAPE.match(tok):
        return False
    return bool(re.search(r"\.[A-Za-z0-9]+$", tok))


def paths(text: str) -> set[str]:
    found: set[str] = set()
    for span in spans(text):
        for tok in span.split():
            if is_repo_path(tok):
                found.add(tok)
    return found


def run(argv: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        argv,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=REPO,
    )


def listed_subcommands(help_text: str) -> set[str]:
    """The first word of each line in a group's `Commands:` section."""
    lines = help_text.splitlines()
    start = next((n for n, l in enumerate(lines) if l.strip() == "Commands:"), None)
    if start is None:
        return set()
    out: set[str] = set()
    for line in lines[start + 1:]:
        if not line.strip():
            break
        out.add(line.split()[0])
    return out


def main() -> int:
    ok = 0

    def passed(msg: str) -> None:
        nonlocal ok
        ok += 1
        print(f"  ok    {msg}")

    def failed(msg: str) -> None:
        print(f"  FAIL  {msg}")
        print("\n  herdr standard DRIFTED")
        sys.exit(1)

    for rel in SOURCES + COMMAND_SOURCES:
        if not os.path.isfile(os.path.join(REPO, rel)):
            failed(f"source file missing: {rel}")

    herdr = shutil.which("herdr")
    if not herdr:
        failed("`herdr` is not on PATH — cannot resolve any invocation")
    omp = shutil.which("omp")
    if not omp:
        failed("`omp` is not on PATH — cannot check `--cwd`")

    version = run([herdr, "--version"]).stdout.strip() or "unknown version"
    print(f"herdr-skill-check: {REPO}  ({version})\n")

    texts = {
        rel: open(os.path.join(REPO, rel), encoding="utf-8").read()
        for rel in SOURCES + COMMAND_SOURCES
    }

    calls: set[tuple[str, str | None]] = set()
    named_paths: set[str] = set()
    for rel, text in texts.items():
        # An unpaired backtick misaligns every span after it, which would drop a
        # named command without saying so — the failure this check exists to catch.
        rest = unfenced(text)
        if rest.count("`") % 2:
            failed(f"backtick spans in {rel} do not pair — extraction would silently miss commands")
        for span in INLINE.findall(rest):
            if len(span) > 200 or "\n\n" in span:
                failed(f"mispaired backtick span in {rel}: {span[:60]!r}")
        calls |= invocations(text)
        if rel in SOURCES:
            named_paths |= paths(text)

    if not calls:
        failed("no `herdr <group>` invocation found in the sources — the check is reading nothing")

    helps: dict[str, str] = {}
    for group, sub in sorted(calls, key=lambda c: (c[0], c[1] or "")):
        if group not in helps:
            res = run([herdr, group, "--help"])
            if res.returncode != 0:
                failed(f"`herdr {group}` no longer resolves (`herdr {group} --help` exit {res.returncode})")
            helps[group] = res.stdout + res.stderr
            passed(f"herdr {group} --help exits 0")
        if sub is None:
            continue
        if sub not in listed_subcommands(helps[group]):
            failed(f"`herdr {group} {sub}` is not listed by `herdr {group} --help`")
        passed(f"herdr {group} {sub} listed by `herdr {group} --help`")

    self_rel = os.path.relpath(os.path.abspath(__file__), REPO).replace(os.sep, "/")
    for rel in sorted(named_paths | set(SOURCES) | {self_rel}):
        if not os.path.exists(os.path.join(REPO, rel)):
            failed(f"path named in the standard does not exist: {rel}")
        passed(f"path exists: {rel}")

    if "--cwd" not in run([omp, "--help"]).stdout:
        failed("`omp --help` no longer lists `--cwd`, which the skill tells a session to use")
    passed("omp --help lists --cwd")

    print(f"\n  {ok} ok, 0 failed")
    print("  herdr standard OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
