---
name: playbook-or-skill
description: "Decide whether new standard work is a playbook, skill, rule, hook or agent, and name it by kind of work. Use before writing any pb-* playbook or standard skill."
---

# Playbook or skill

## The rule

| artifact | holds | named for | example |
|---|---|---|---|
| playbook (`pb-*`) | the ordered phases one run of a **kind of work** goes through | the kind: `pb-bugfix`; a kind with no playbook yet is still a kind (`pb-migration`, proposed) | `pb-feature` |
| skill | a **standard**: how to do one step well in one domain or technology | the domain/technology | `dagster-cli-first`, `duckdb-extra`, `semantic-modeling` |
| rule | a constraint that must hold on every generation without being asked for | the constraint | `principle-prove-it-works`, `new-source-rule` |
| hook | a guard that makes a wrong action impossible | the guarded action | the migration DROP guard |
| agent | a role for one domain, with tools, that autoloads that domain's skills | role × domain | `data-engineer`, `data-reviewer` |

Source: the pstack model (pstack@157aae39) as adopted for this harness on 2026-10-01: playbooks are organised by kind of work, skills hold standards, thin agents load those skills.

## The test: same phases, different skills

Before comparing phases, answer the incumbent question: **does a working
implementation of this behaviour already exist — here, or in a repository being
replaced?** The answer names the incumbent (path/repo) or affirmatively states
none. "Never asked" is not "none": routing by phase shape silently defaults to
"none" — the wttj port never asked, so the predecessor's working mechanisms
were dropped without the loss ever entering the plan. A named incumbent makes
the work a **replacement** — behaviour held constant — which is
`pb-refactoring`'s kind with a different binding, so it routes to
`pb-refactoring`, not to `pb-feature`. Only then compare phases.

Write down the todo phases the work goes through in two domains.

- **Same phases** → one playbook. Put the domain difference in a skill, bound through the domain table in `skill://operating-mode`.
- **A phase exists in one domain with no counterpart in the other** → a separate playbook, still named for the kind. Add a domain to the name (`pb-<domain>-<kind>`) only when the kind exists in that domain alone. Where this conflicts with the naming default in the convention doc below, this rule wins: the domain prefix is a fallback, not the normal case.

| work compared | phases | verdict |
|---|---|---|
| data-quality incident vs bug fix | contain/diagnose/fix/verify/record ↔ reproduce/find cause/fix/verify/land | one kind (bug fix). The data skill adds blast radius from real rows and the landed-nothing guard |
| warehouse schema migration vs app database migration | read state, write migration, ship with code, verify on a copy, record | one kind (migration). Alembic and DuckDB are the data binding |
| UI prototype vs data-model spike vs moodboard | frame, gather references, build ≥2 candidates, decide, hand off | one kind (design) |
| one-off slow query vs sustained metric push | baseline, hypothesis, measure, keep or revert | one kind (optimize), in two modes |

## How a domain binds to a playbook step

A playbook step names the qualifying agents inline or a surface, never a
technology: "reproduce on the matching surface". A multi-domain playbook lists
the qualifying agents in the item (for example
`[app-backend-engineer|data-engineer|ux-engineer|iac-engineer|harness-engineer]`);
a domain-specific playbook names one (`[data-engineer]`). Three places resolve it:
1. the domain table in `skill://operating-mode` (engineer, reviewer, verify surface);
2. the agent's `autoloadSkills`;
3. project skills under the repo's `.omp/skills/`.

To make a playbook work for a new domain, add a skill and bind it in one of those three places. Do not fork the playbook.

## Authoring a playbook

- `SKILL.md` and `todo.json` sit side by side in `skills/pb-<name>/`. The
  SKILL.md section order is fixed: `## When` / `## Outcome` / `## Todo` /
  `## Done when`.
  - `## When` contains a line starting `Not:` naming the neighbour playbooks
    this one is not for.
  - `## Todo` is the linking paragraph only (see `pb-feature` for the template);
    the phases and items live in `todo.json`, verbatim — no drift between the
    two files.
  - `## Done when` ends with a final bullet starting `Reply:` (per
    `skill://unslop`).
- `todo.json` shape:
  `{"phases":[{"phase":"<prefix>: <name>","items":["[role] text", ...]}]}`.
  - The phase prefix is the playbook name without `pb-` (e.g. `feature: ...`).
  - No duplicate phase names; no item text repeated anywhere in the file.
  - Every item opens with a bracketed role list. Roles are real agents, pipe
    separated, e.g.
    `[app-backend-engineer|data-engineer|ux-engineer|iac-engineer|harness-engineer]`.
    Never placeholders like `[<domain>-reviewer]`.
- Mark a phase `(parallel)` only when its items are genuinely independent of
  each other.
- Compose another playbook with the literal text `run pb-<name>` in an item.
- Index the playbook in `WORKFLOWS.md`.
- Run `bun ~/.omp/agent/scripts/lint-playbooks.ts` before committing; exit 0 is
  the gate.

## Before writing one

- Check the evidence bar with `skill://imp-standardize`. Do not restate its numbers here; it owns them.
- Read the existing `pb-*` descriptions. A new kind that only renames an existing one is a binding, not a playbook.
- Follow the playbook convention doc (`example-ext/docs/extension/convention.md`) for the playbook format: its name/description limits, and the required `todo.json` beside `SKILL.md` holding the phases and their items (each item opening with a `[role]`). It owns the format; this skill owns the decision.
- Route the authoring itself: a new kind starts under `pb-spec`, its design goes
  through `pb-design`, and routine edits to an existing playbook go through
  `pb-feature`. (`pb-harness` is deleted; it no longer owns authoring.)
