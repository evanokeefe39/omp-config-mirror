#!/usr/bin/env python3
"""Scaffold the harness documents from the canonical templates.

Usage:
    uv run python scaffold_docs.py --dir <target> [--workflow <name>] [--force]
    uv run python scaffold_docs.py --dir <target> --project <name> [--force]
    uv run python scaffold_docs.py --dir <target> --only DEFECTS.md VERIFY.md [--force]

Renders DEFECTS.md, IMPROVEMENTS.md, FEEDBACK.md and VERIFY.md into <target> from
the templates in ../templates/ (or the subset named by --only). Idempotent: an
existing target file is skipped (its path printed) unless --force is passed.
Exits non-zero if any selected template is missing, and pre-flights all
selected templates before writing anything, so a scaffold is never left
half-done.

Scope is selected by --workflow (a workflow agent) or --project (a project
root) — the two are mutually exclusive; neither means the global harness. A
main-scope render produces all four ledgers; a workflow agent renders
IMPROVEMENTS.md only (see SKILL.md — DEFECTS/FEEDBACK/VERIFY are scope documents).

The two REGISTERS — FEEDBACK.md and VERIFY.md — require the lifecycle stage list:
--set lifecycle="research → design → develop → test → CI → CD → monitor" is
mandatory whenever either is selected. Missing it exits non-zero rather than
rendering a placeholder — variables fail closed. The lifecycle is the DOMAIN's,
so it is supplied by the caller, never defaulted here.

Templates are plain markdown carrying %%UPPERCASE%% placeholders, filled by plain
string replacement — the standard library only, no template engine and nothing
to install. A stray %%PLACEHOLDER%% stays visible in the rendered file and is
greppable, and the form deliberately does not look like a template-engine
syntax, so nothing here implies a dependency it does not have.

(Until 2026-09-28 these were .j2 Jinja templates rendered two ways, documented as
producing "identical output". They did not: Jinja2 strips the final newline and
the stdlib path preserved it, so the same command produced two different files.
The engine branch was removed rather than reconciled — it was the worse output.)

Text is always written with LF newlines (never through default newline
translation — see the factory log entry dated 2026-09-14).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
DOCS = ("DEFECTS.md", "IMPROVEMENTS.md", "FEEDBACK.md", "VERIFY.md")
# A workflow agent carries its own improvement ledger and nothing else:
# DEFECTS, FEEDBACK and VERIFY are SCOPE documents, so rendering them into an
# agent's directory creates ledgers the contract says must not exist there.
# See ~/.omp/agent/docs/workflow-agent-contract.md.
AGENT_DOCS = ("IMPROVEMENTS.md",)
# The documents' human titles live in the templates themselves — a template is
# the document, so it states its own name. The script knows only the filenames.


def render(template_text: str, variables: dict[str, str]) -> str:
    """Fill %%KEY%% placeholders. Stdlib substitution — no template engine."""
    out = template_text
    for key, value in variables.items():
        out = out.replace(f"%%{key.upper()}%%", value)
    return out


def variables_for(scope: str, extra: dict[str, str]) -> dict[str, str]:
    """Build the render variables for one document.

    Two variables exist, and each is something a template cannot know:

    - ``scope`` — the ledger names the scope it belongs to, because these files
      are otherwise identical wherever they sit and get pasted out of context.
      Empty means the global harness. A --project name renders "<name> project".
    - ``lifecycle`` — the stage list the two registers (FEEDBACK, VERIFY) are
      read against. Only the caller knows it, and main fails closed when it is
      missing rather than rendering an empty stage line.
    """
    if not scope:
        scope_label = "global harness"
    elif _is_project(extra):
        scope_label = f"{scope} project"
    else:
        scope_label = scope
    variables = {"scope": scope_label, "lifecycle": ""}
    variables.update(extra)
    return variables


def _is_project(extra: dict[str, str]) -> bool:
    """True when this render targets a project rather than a workflow agent."""
    return extra.get("__project__") == "yes"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Scaffold DEFECTS/IMPROVEMENTS/FEEDBACK/VERIFY into a target directory."
    )
    parser.add_argument("--dir", required=True, type=Path, help="target directory")
    scope_group = parser.add_mutually_exclusive_group()
    scope_group.add_argument("--workflow", default="", help="workflow name; empty for the global instance")
    scope_group.add_argument("--project", default="", help="project name; renders project-scope documents")
    parser.add_argument("--only", nargs="+", choices=DOCS, metavar="DOC", help="scaffold only these documents (subset of %s)" % (", ".join(DOCS)))
    parser.add_argument("--set", action="append", metavar="KEY=VALUE", help="extra template variable, repeatable: --set lifecycle=\"design → CI\"")
    parser.add_argument("--force", action="store_true", help="overwrite existing files (factory never passes this)")
    args = parser.parse_args(argv)

    target: Path = args.dir.expanduser().resolve()
    workflow = args.workflow.strip()
    project = args.project.strip()
    scope = workflow or project
    # Default selection follows the scope: an agent gets its improvement ledger only.
    # --only overrides it either way, so a caller can still ask for a subset.
    selected = tuple(args.only) if args.only else (AGENT_DOCS if workflow else DOCS)

    extra: dict[str, str] = {}
    for pair in (args.set or []):
        key, sep, value = pair.partition("=")
        if not sep or not key:
            print(f"error: --set expects KEY=VALUE, got {pair!r}", file=sys.stderr)
            return 1
        extra[key.strip()] = value
    if project:
        extra["__project__"] = "yes"

    # Both REGISTERS (FEEDBACK, VERIFY) carry the lifecycle stage list: they state
    # what exists now, and are read against the stages of the domain. Without it a
    # template renders an empty stage line, so the run fails closed rather than
    # writing a placeholder into a document a human is meant to trust.
    registers = [d for d in ("FEEDBACK.md", "VERIFY.md") if d in selected]
    if registers and not extra.get("lifecycle", "").strip():
        print(
            f'error: {" and ".join(registers)} require --set lifecycle="<stages>"',
            file=sys.stderr,
        )
        return 1

    # Pre-flight: every selected template must exist before anything is written,
    # so a missing template never leaves a half scaffold behind.
    for doc in selected:
        if not (TEMPLATES_DIR / f"{doc}.tmpl").is_file():
            print(f"error: missing template {TEMPLATES_DIR / (doc + '.tmpl')}", file=sys.stderr)
            return 1

    target.mkdir(parents=True, exist_ok=True)
    for doc in selected:
        out_path = target / doc
        if out_path.exists() and not args.force:
            print(f"skip (exists): {out_path}")
            continue
        template_text = (TEMPLATES_DIR / f"{doc}.tmpl").read_text(encoding="utf-8")
        rendered = render(template_text, variables_for(scope, extra))
        with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(rendered)
        print(f"wrote: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
