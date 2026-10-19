---
name: imp-setup
description: >
  Establish a scope's operating model — a plan/apply analysis that decides whether
  the scope is greenfield or brownfield, declares its lifecycle stages, and
  scaffolds the four ledgers it needs. Works for any scope that produces
  artifacts: a codebase, the global harness, a document set, a content channel, a
  media library. Use when starting a new scope, adopting an existing one, or
  inheriting work whose history is scattered.
---

# imp-setup — establish a scope's operating model

The four ledgers are a scope's memory: what broke, what changed, what would have
caught it, and what proves it works. A scope without them repeats its own
mistakes and cannot say whether it is improving.

This is **plan/apply**. Nothing is written until the plan has been shown and
approved — a ledger seeded with invented rows is worse than an empty one, because
it looks like evidence.

**Scope is any system that produces artifacts**, not only a codebase:

| scope | produces | lifecycle stages (example) |
|---|---|---|
| a software / data system | software, datasets | research → design → develop → test → PR + review → CI → CD → monitor |
| a media or creative project | video, imagery, audio | brief → capture → edit → review → master → release |
| an infrastructure / IaC repo | running infrastructure | design → plan → review → apply → drift check → operate |
| a document set | published documents | outline → draft → review → publish |
| a content channel | posts, threads | idea → draft → schedule → publish |
| the global harness | agent behaviour | design → dev → operate |

### The lifecycle is the domain's, and it is a cycle

Name the stages for *this* domain — never fall back on a software list. Two
consequences follow from getting it right:

**It does not stop at production.** A system's life continues past monitoring and
then loops back — **enhance**, **refactor**, **redesign** — or exits at
**decommission**. A lifecycle ending at "prod" has no stage for the work that
follows, which is most of a system's life, so a defect that arises from *changing*
a working system has nowhere to land.

**Both registers declare it.** `FEEDBACK.md` and `VERIFY.md` carry the stage line
at the top, because it is their coverage axis: a stage with no sensor, or no
check, becomes a *visible gap* rather than an omission nobody can see. The scope's
own `AGENTS.md` declares it too — that is the file read first, and the lifecycle
is part of what the scope *is*. The **global** `AGENTS.md` never carries one; it
serves all domains.

### Declaring the lifecycle in the scope's `AGENTS.md`

This operation is where the lifecycle gets *written*, and the `AGENTS.md` copy is
the one that needs care:

1. **Read it first.** An existing `AGENTS.md` carries conventions and hard-won
   context. Read it before proposing anything.
2. **Append, never rewrite.** Put the lifecycle at the **end** of the file as a
   section of its own. Rewriting an `AGENTS.md` to insert a list destroys context
   that was written for a reason; appending costs nothing and keeps the diff
   readable.
3. **If there is none, create one** — the scope's name and purpose, its lifecycle,
   and a pointer to its ledgers. For a media, document or channel scope this is
   often the only operating document the scope has, so write it to stand alone.
4. **Recommend, then apply.** Show the exact section you would append and where.
   Write it only on approval.

```markdown
## Lifecycle

Stages: brief → capture → edit → review → master → release → audience feedback
(loops: re-cut, re-release; exit: archive)

Declared for the `FEEDBACK.md` and `VERIFY.md` stage lines. Change all three
together.
```

That is three files holding one list. The duplication is justified — each is read
in a different situation — and the apply step verifies all three agree.

## Run it when

- a new scope starts and has nowhere to record a defect
- an existing scope has history but no ledgers — scattered logs, incident lists,
  retro files, runbooks
- a scope's checks live in prose and nobody can say which are real
- you inherited a repository or channel and need to know what is already claimed

## Steps

### Plan

1. **Survey the scope by going to the ground**, not reading intent — recent
   history, existing documents, existing gates, existing incidents. **Read the
   scope's `AGENTS.md` if it has one** before proposing anything: it carries
   conventions this operation must not contradict. Record what you found and where.
2. **Detect the domain from what is actually there**, never from what the scope
   says about itself:

   | you find | the domain |
   |---|---|
   | `pyproject.toml`, `package.json`, `src/`, a test suite | software |
   | `dbt_project.yml`, `dagster`, `*.sql`, an orchestrator | data |
   | `*.tf`, `terraform/`, provider config, a state file | infrastructure / IaC |
   | mostly markdown, an outline, a publishing pipeline | documents |
   | a posting calendar, platform analytics, draft copy | a content channel |
   | `.mp4`, `.wav`, `.psd`, a DAW or NLE project, RAW files | media |
   | several at once, or a monorepo | name the **primary** artifact, or declare
     more than one lifecycle explicitly |

   Detection decides the lifecycle, and the lifecycle is what both registers are
   read against — so getting it wrong silently mis-frames every later row. **Say
   what you inferred it from.**
3. **Classify it — greenfield or brownfield.** *Greenfield*: nothing has landed,
   so the ledgers start empty and stay empty until real work happens.
   *Brownfield*: artifacts and their history exist, and that history is the seed.
4. **Declare the lifecycle stages.** They go at the top of *both* registers — and
   in the scope's own `AGENTS.md` (below).
5. **Propose.** Present the four files, the lifecycle, the proposed `AGENTS.md`
   change, and — brownfield only — what you would seed into each, **with the
   artifact that justifies every proposed row**. Ask before writing. The default
   is the empty scaffold.

### Apply

6. **Write only what was approved**, then verify: the four files parse at their
   schema, the lifecycle is declared **and identical in all three places**
   (`AGENTS.md`, `FEEDBACK.md`, `VERIFY.md`), and one real artifact is captured
   end-to-end — file a real defect through `imp-defect` and watch the row land.
   A scope that cannot record its first real defect is not set up.

## Seeding a brownfield scope

An existing scope's history is somewhere: incident lists, retro files, runbooks,
review guides, lesson logs, issue trackers. Every one of those is a second home
that will drift unless it is folded into the ledger that owns its concern:

| what you found | where it belongs |
|---|---|
| a record of something that failed | `DEFECTS.md` — one row per **instance**, never merged |
| dated improvement history | `IMPROVEMENTS.md` (release notes stay in `CHANGELOG.md`) |
| something that observes a signal | `FEEDBACK.md` |
| a gate, a test, a check | `VERIFY.md` — and it needs a real `goes red` case |
| durable knowledge or rationale | the document that already owns that concern |

### Default proving surfaces for a new `VERIFY.md`

When the scaffolder or the apply step seeds `VERIFY.md` for a scope, seed one
proving-surface row per domain the scope produces artifacts in — these are the
defaults, kept or deleted as the scope's real surfaces become known. The row's
`command` is still concrete and runnable in the scope; the list names what the
row must exercise, not the literal command:

| domain | default proving surface (seed row) |
|---|---|
| data | a real-data query or materialization, with row counts before and after |
| ux | a browser tab and a screenshot of the real page in the changed state |
| app-backend | the running service, or the CLI exercised via `bash` with a pty, output captured |
| docs and prose | the rendered document, read in full |
| infrastructure | the plan output plus a post-apply probe (no drift) |
| anything else | run the changed path once and observe it |

The harness domain is not pre-seeded: its surface is `omp --mode rpc` or
`omp -p --no-session` from a sandbox in a fresh process, output kept, which
only a harness scope needs.

### Migrating a superseded document

When a file has become a second home for something a ledger owns, move it —

1. **Inventory** every candidate source and classify each item by the table above.
2. **Decide per item: a row, or a row plus an anchor.** Prose that carries
   rationale becomes a row whose `evidence` points back into the preserved source.
3. **Preserve the source verbatim.** Move it under `docs/` with one `git mv`, add
   a header note naming the ledger that supersedes it, keep the body untouched.
   Never delete unread.
4. **Translate once, into the current schema.** One table, one schema — never a
   legacy table alongside the new one.
5. **Repoint every inbound link**, then run the scope's own link check.
6. **Verify**: N source items became N rows, every row parses at its schema, and
   nothing remains that a ledger now owns.

## The scaffolder

```bash
uv run python ~/.omp/agent/skills/imp-setup/scripts/scaffold_docs.py \
    --dir <target-dir> [--workflow <name> | --project <name>] \
    [--only DEFECTS.md IMPROVEMENTS.md FEEDBACK.md VERIFY.md] \
    [--set lifecycle="<stages>"] [--force]
```

- `--dir` — where the files land: a repo root, a channel's dir, `~/.omp/agent`.
- `--workflow <name>` / `--project <name>` — mutually exclusive; each sets the
  title and owner. Neither means the global harness.
- Renders a file **only when it is absent**, so a second run changes nothing and
  every skip is printed. `--force` is the sole overwrite path and is **forbidden
  on a file with landed rows**.
- `--set lifecycle="<stages>"` is **mandatory whenever a register is selected** —
  `FEEDBACK.md` or `VERIFY.md`. Omit it and the run exits non-zero having written
  nothing, so a register never lands with an empty stage line.

The templates in `templates/` are plain markdown carrying `%%SCOPE%%`, plus
`%%LIFECYCLE%%` in the two registers. Fill one by hand the same way if that is
easier — the script exists for the two guards above (fail closed on the
lifecycle; never clobber a file with landed rows), not because the substitution
is hard. It is standard library only: nothing to install, and no template engine
in the path.

## Done when

The scope can record a defect, a change, a sensor and a check without anyone
asking how — and for a brownfield scope, nothing is left that duplicates a ledger.

## Where it lands

The four files at the scope's root, or `~/.omp/agent/` for the global harness.
`IMPROVEMENTS.md` is the only one a workflow agent carries; the rest belong to the
scope, and the agent attributes its rows rather than holding a copy.

Each ledger's row format belongs to the operation that writes it — `imp-defect`,
`imp-feedback`, `imp-change`, `imp-verify`. This operation establishes a scope; `imp-standardize`
decides what the work inside it should look like.
