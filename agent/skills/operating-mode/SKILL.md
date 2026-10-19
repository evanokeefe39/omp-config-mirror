---
name: operating-mode
description: "Playbook items name the qualifying agents inline; this skill explains which domain each agent covers and names the surface that proves its work. Read when a step says 'verify on the matching surface' or you need to place an agent in a domain."
metadata:
  source: "pstack@157aae39 skills/poteto-mode"
  license: "MIT — skill://operating-mode/LICENSE-pstack.txt"
---

# operating-mode

Playbook items name the qualifying agents inline, for example
`[app-backend-engineer|data-engineer|ux-engineer|iac-engineer|harness-engineer]`.
This skill explains which domain each agent covers and names the surface that
proves its work.

## Domain table

Match the domain on what is being changed, not on where the repo lives.

The proving surface for each domain is a row in the owning scope's `VERIFY.md`
(`skill://scope-registers`). A scope with no `VERIFY.md` has no declared
surface: run `/imp-setup`, and a reviewer reports INCONCLUSIVE: no `VERIFY.md`
rather than a pass.

| domain (match on what is changed) | engineer | reviewer | designer |
|---|---|---|---|
| harness: `~/.omp/agent/`, a repo's `.omp/`, an omp extension | `harness-engineer` | `harness-reviewer` | — (trial pending) |
| data: pipelines, Dagster assets, warehouse, schemas | `data-engineer` | `data-reviewer` | `data-designer` |
| ux: web UI | `ux-engineer` | `ux-reviewer` | — (trial pending) |
| app-backend: services, APIs, CLIs, libraries | `app-backend-engineer` | `app-backend-reviewer` | `app-backend-designer` |
| docs and prose | `doc-writer` | `doc-reviewer` | — (trial pending) |
| infrastructure | `iac-engineer` | `iac-reviewer` | — (trial pending) |
| anything else | bundled `task` | bundled `reviewer` | — (trial pending) |

## Where standards live

- **Per-domain skills** are autoloaded by the pair frontmatter (`autoloadSkills`).
- **Named standards**: the data domain's ingestion standard is
  `ingestion-standards` (normative, platform-stage-indexed; its advisory
  sibling `ingestion-best-practices` holds the techniques). Onboarding a source
  whose behaviour or transport is unknown is `pb-source-discovery` work — a
  gated discovery run, not inline feature work.
- **Per-domain rules** are injected only into the pair, through their `agents:`
  glob. They are absent from `main` and from other domains by design.
- **Principles** are rulebook rules named `principle-*`; read one with
  `rule://principle-<name>`.
- **Checks and sensors** come from `skill://scope-registers`, discovered at runtime
  and never hardcoded into an agent.
- The harness's own operating principles are in `~/.omp/agent/AGENTS.md`; do not
  restate them.

## Shared conventions

- Every ported playbook ends in its `Reply:` line, written per `skill://unslop`.
- `run pb-open-pr` appends the open-PR phases.
- A role prefixed `domain-` resolves through the table above; a `[scout]` item goes
  to the `scout` agent and `[main]` is the calling session.
