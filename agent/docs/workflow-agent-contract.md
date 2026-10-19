# Workflow-agent contract

> The factory that stamped these agents was retired on 2026-09-28 and no new
> agents are created. This documents the contract the eleven that exist were
> built to, so they can still be read and fixed.

Every workflow agent is **two files** — `agents/<name>.md` and
`agents/<name>/IMPROVEMENTS.md` — plus one row in `WORKFLOWS.md`. The procedure
lives in the definition body as prose steps. The `workflow.yaml` graph that used
to accompany each agent was removed on 2026-09-28: every body already carried its
graph node-for-node, so the graph added nothing but a second place to drift.

## 1. `agents/<name>.md` — the definition

Frontmatter (exact fields, comma-separated lists):

```yaml
---
name: <name>                    # = directory name = the agent file stem
description: >                  # trigger phrases + what it is NOT for
model: "@worker"                # modelRoles.worker; routing changes in config.yml, never here
thinkingLevel: off              # workers run deliberation-free; revisit via the IMPROVEMENTS.md feedback loop
tools: read, grep, glob, …      # the smallest set the work needs; read-only agents get no write/edit
autoloadSkills: —               # skill://workflow-contract was deleted 2026-09-28
---
```

Body sections, in order:

1. **Improvement-history line** — points at `agents/<name>/IMPROVEMENTS.md`, loaded
   on demand only.
2. **One-paragraph role** — the outcome this agent owns, not the steps.
3. **Input Requirements** — what the dispatching brief must carry (intent,
   target paths, acceptance criteria). If a brief lacks these, the agent stops
   at `blocked` and says which input is missing.
4. **Output Requirements** — the structured result fields (every field the
   orchestrator checks), plus where ledger rows go (proposed in output; the
   orchestrator appends).
5. **Procedure** — the numbered steps, with the guardrails and the verification
   demands written into them. **This is the procedure.** Where work stops early,
   report which step and why.

## 2. `agents/<name>/IMPROVEMENTS.md` — the improvement ledger

The one document every workflow agent carries, scaffolded by `skills/imp-setup`
and appended to after any run that surfaces a correction or near-miss. Format is
owned by `skill://imp-change` — never hand-edit a generated document's structure;
edit the template.

`DEFECTS.md`, `FEEDBACK.md` and `VERIFY.md` are **scope documents**, not agent
documents. They live at the global harness (`~/.omp/agent/`) or at a project root
(`<repo>/`), one ledger per scope, and attribute each row to the workflow that
produced it — defect rows via `observed_by`, verify rows via `scope`
(e.g. `agents/<name>`). A workflow agent proposes rows for the owning scope's
ledger in its structured output; it never carries its own copy.

## Stop vocabulary (binding)

Every agent's `status` is exactly one of four:

| status | meaning |
|---|---|
| `done` | work completed and verified |
| `blocked` | cannot proceed — needs input or a revised plan; name what is missing |
| `escalated` | specification ambiguity, or severity beyond this agent's scope |
| `aborted` | too damaged to continue safely — stop and hand back, never continue |

`blocked` beats guessing; `escalated` beats a consequential decision made
silently; `aborted` beats continuing on a damaged state.

## Document ownership

| Defect / observation | Lands in |
|---|---|
| bad artifact (output of a repo) | the project's `DEFECTS.md` — or the harness ledger for a write-frozen repo (the data platform) |
| workflow ran wrong (process defect) | the owning scope's `DEFECTS.md`, `observed_by: agents/<name>` |
| harness/factory defect | the global harness `DEFECTS.md` |
| agent improved or needs improving | `agents/<name>/IMPROVEMENTS.md` Ledger table |
| sensor available | the owning scope's `FEEDBACK.md` catalogue |
| how to prove this agent's work | the owning scope's `VERIFY.md`, `scope: agents/<name>` |

## Ledger rules (binding)

- **Histories** — `DEFECTS.md`, `IMPROVEMENTS.md` — are append-only. One row per
  instance; instances are never merged, because the count is the signal. A
  correction is a new row whose `context` names the row it supersedes.
- **Registers** — `FEEDBACK.md`, `VERIFY.md` — describe what exists *now*, so a
  retired or re-homed entry has its row **replaced**. Holding a register
  append-only is how a stale row survives.
- Workflow agents PROPOSE ledger rows in their structured output; the
  orchestrator appends them. (The pilot is hard read-only; write-capable agents
  may be granted direct append later, per agent.)
