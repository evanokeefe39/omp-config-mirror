---
name: backlog-conventions
description: >
  How work is tracked with Backlog.md (a markdown kanban in each repo's
  `backlog/` folder) and how it ties into git: one prefix per repo, task shape,
  kind and domain labels, branch and PR-title IDs, milestones, and the lazy
  import of old Linear (SOLO-n) tickets. Builds on git-conventions. Use when
  creating or updating tasks, filing a bug, opening a PR, planning a release, or
  starting work in a repo that has no `backlog/` yet.
---

# Backlog conventions

Backlog.md is the backlog and bug tracker; GitHub holds code and pull requests.
Tasks are plain markdown files in the repo, so they branch, diff, review and
merge with the code. They also need no network, so a benchmark container
(Harbor, Daytona) has the whole board without an allow-list entry.

The tool is new and moves fast, so this skill states only behaviour checked
against the pinned release. The cited reference is
[`references/backlog-md.md`](references/backlog-md.md) (v1.54.0, every claim with
a `path:line` in the upstream source). Upstream docs:
<https://github.com/MrLesk/Backlog.md/blob/v1.54.0/README.md>, `CLI-INSTRUCTIONS.md`
and `ADVANCED-CONFIG.md` beside it. The workflow guides ship with the binary:
`backlog instructions overview|task-creation|task-execution|task-finalization`.
Re-check the reference before relying on anything a newer release may change.

## Access: MCP in a session, CLI everywhere else

- **MCP** — the global `backlog` server (`~/.omp/agent/mcp.json`, `backlog mcp
  start`, stdio). omp starts it in the project directory and advertises MCP roots,
  so one user-level server follows whichever repo the session is in. Its tools
  are `task_create|list|search|view|edit|archive|restore|delete`,
  `milestone_*`, `document_*`, `definition_of_done_defaults_*` and
  `get_backlog_instructions`. A repo with no `backlog/` gets only the
  `backlog://init-required` resource and **no tools**: that is the signal to run
  the init below, not to skip tracking.
- **CLI** — `backlog …` with `--plain` (human-readable, agent-safe) or `--json`
  (`task list`, `task view`, `search`). Use it in scripts, hooks, containers and
  any session where the MCP tools are absent. Installed with `bun add -g
  backlog.md@1.54.0`; check with `backlog --version`.
- **Never hand-edit** a file under `backlog/tasks`, `drafts`, `milestones`,
  `docs` or `decisions`. The CLI and MCP keep IDs, section markers and
  relationships consistent; a hand edit can make a later section replace refuse
  (reference §3). The one exception is `backlog/linear/` (see `## Importing old
  Linear tickets`), which the tool never reads.
- If neither MCP nor CLI works, stop and say so. Never skip tracking quietly.

## Precedence

Issues go to Backlog.md in every repo; GitHub issues are not created (the
command guard blocks `gh issue create` and `gh api` POSTs to `/issues`). A
repo's own `AGENTS.md` may add tracking detail but cannot move issues elsewhere.
Existing GitHub issues stay where they are; read, comment on or close them
freely. **Linear is gone:** the workspace was exported once (2026-10-17) and the
harness no longer connects to it. Its tickets are history, imported from that
export when a repo is next worked on.

## Setting up a repo

A repo gets a backlog the first time work in it needs a task, and `pb-new-project`
gives every new scope one. From the repo root, on the work branch:

```bash
backlog init "<repo-dir-name>" --defaults --task-prefix <PREFIX> --integration-mode none
backlog config set remoteOperations false
```

- **Prefix: letters only, at most 4, unique across the user's repos** — `OMP`
  for omp-home. List the prefixes in use with `rg -g config.yml "^task_prefix"
  ~/repos/*/backlog ~/.omp/backlog` before choosing. The tool lowercases it in
  file names and uppercases it in IDs (`OMP-12`).
- **The prefix is permanent.** The CLI refuses to change it, and a backlog holds
  **exactly one prefix**: every reader globs `<prefix>-*.md`, so a task file with
  any other prefix is invisible to list, view and search and its number is not
  reserved (reference §2). Never put a second prefix's task in `backlog/tasks`.
- **`--integration-mode none`**: this skill and the global MCP server replace the
  instruction block `backlog init` would write into `AGENTS.md`.
- **`remoteOperations false`**: with it on, every task read runs `git fetch
  origin`, which fails or stalls in an offline container. One user, one clone at
  a time, so cross-clone ID races do not arise. `autoCommit` stays `false` (the
  default): tasks are committed with the work, on its branch, never by the tool
  (which would commit on whatever is checked out, including `main`).
- Set the board's columns and add the kind and domain labels below by editing
  `backlog/config.yml` (upstream's documented route: `statuses` and `labels`
  cannot be set with `backlog config set`): `statuses: ["To Do", "In Progress",
  "For Review", "Done"]` (`### Statuses` below), the labels under `labels:` so
  the web UI offers them, and the kind list under `types:` (`types: ["bugfix",
  "feature", …, "content"]`, the `kind` table below) so a card's kind can be its
  type. Task labels are free-form, so the label list is a suggestion, not a check;
  `--type` is checked against `types`.
- Create the standing milestone: `backlog milestone add maintenance -d "Unplanned
  fixes and upkeep that serve no open goal; never archived, ships under the release
  time cap."` (`### Releases and milestones`).
- `backlog init` can write `default_editor` from the shell's editor variables;
  an agent shell sets `EDITOR`/`GIT_EDITOR` to `true`, so the line reads
  `default_editor: "true"` (seen on omp-home's init). Delete it from
  `backlog/config.yml`; `EDITOR` still wins at runtime (`src/utils/editor.ts:25`).
- Record the backlog in the repo's `AGENTS.md` under `## Tracking`: the prefix,
  the path `backlog/`, and `skill://backlog-conventions`.
- Commit `backlog/` in the same PR as the work that needed it.

## Tasks

- **Look before you create**: `task_search` / `backlog search "<words>" --plain`.
  A duplicate is worse than a missing row. After any write, view the task and
  confirm the fields landed.
- **Title**: imperative, names the behaviour — `Handle null cursor in page
  fetch`, not `Bug in API`.
- **Labels: exactly one `kind` and one `domain`** (tables below), **and the
  `type` field set to the same kind** (`--type <kind>`). The board shows the type
  as the card's coloured badge beside its ID, and labels only as plain chips under
  the title, so a kind kept only in a label does not read as the card's kind
  (omp-home, 2026-10-19: 32 of 33 cards had no type, raised by the user). Nothing
  enforces one-of-each or the label and type agreeing, so read the task back.
- **Description** says the outcome and why; **acceptance criteria** (`--ac`,
  repeatable) are specific, testable and independent. No implementation plan at
  creation for future work: the plan is written when work starts (`--plan`),
  against the code as it is then.
- **Criteria and done items are fields, never description prose.** Acceptance
  criteria go in `--ac` and done evidence in `--dod` (MCP `acceptanceCriteria` on
  create, `acceptanceCriteriaAdd`/`Set` on edit; `definitionOfDoneAdd` on both), one
  item each. An `**Acceptance**` or `**Evidence of done**` block, or a `- [ ]` list,
  inside `-d` is invisible to the tool: the board shows "Acceptance criteria: none",
  `--check-ac` has nothing to check, and finalization cannot prove the task done. A
  ticket copied from elsewhere is split into these fields when it is created
  (`import-linear.ts` does this for Linear tickets). Read-back: `grep -L '<!--
  AC:BEGIN -->' backlog/tasks/*.md` lists every task with no criteria section, old
  ones included, and must not list any file this run created.
- **Bug description**, in this order: Steps to reproduce, Expected, Actual,
  Environment, Evidence (log line, screenshot, failing command). This is the
  input `pb-bugfix` reproduces from; a bug without steps is a question.
- **Priority**: `high` = blocks current work or broken in use · `medium` =
  scheduled work · `low` = someday. Unsure → `medium`.
- **Statuses** — four columns, so the board tells "being built" from "waiting to
  be checked" (`### Statuses`). Abandoned or duplicate work: a final note saying
  why, then `task archive`.
- **One task per playbook run.** Every run of `pb-spec`, `pb-design`,
  `pb-feature`, `pb-bugfix`, `pb-refactoring` and `pb-kaizen` works on its own
  task, labelled with that run's kind. A run handed on by another depends on it:
  the design task has `--dep <spec task>`, the feature task `--dep <design
  task>`.
- **Subtasks** (`-p <parent>`, IDs like `OMP-5.1`) for work that shares one goal
  and one subsystem; **dependencies** for work across independent components.

### `kind` — what sort of work

The kind of work, whether or not a playbook exists for it. **The label set is
`skill://git-conventions`' branch-prefix list, one for one**: a task's `kind` is
its branch prefix and picks its PR-title type (`## Git integration`). Stable: add a
kind only when work recurs that none of these describe, and add it to
`git-conventions` and the command guard's `branch-naming` list in the same change.

| label | the work | playbook |
|---|---|---|
| `bugfix` | restore broken behaviour | `pb-bugfix`, `pb-data-quality-incident` |
| `feature` | new or changed behaviour | `pb-feature` |
| `refactor` | change structure, hold behaviour constant | `pb-refactoring` |
| `spec` | agree testable behaviour before design | `pb-spec` |
| `design` | choose the shape before building | `pb-design` |
| `investigation` | answer a question; output is a cited explanation, not code | `pb-investigation`, `pb-source-discovery` |
| `migration` | move data, schema or a system to a new shape or home | `pb-data-schema-migration` |
| `chore` | maintenance with no behaviour change: deps, config, scaffolding | `pb-new-project` |
| `docs` | project documentation: anything under a repo's `docs/`, READMEs, reference and how-to pages | none yet (`doc-writer` / `doc-reviewer` do the work) |
| `continuous-improvement` | improve how the work is done: retrospectives, post-mortems, kaizen passes, ledger reviews | `pb-kaizen` |
| `content` | a publishable piece outside a repo's docs: article, social post, portfolio item | none yet |

`docs` is a kind, not a domain: documentation for a data pipeline is
`docs` + `data-engineering`. `content` pairs with `blogging` or `marketing`.

### `domain` — where the work lives

The primary domain. Split a task that genuinely spans two rather than
choosing for it. Engineering domains match the agent families in
`skill://operating-mode`.

| label | covers | agents |
|---|---|---|
| `app-engineering` | services, APIs, CLIs, libraries, full-stack apps | `app-backend-*` |
| `ux-engineering` | web UI: components, pages, styles, design systems | `ux-*` |
| `mobile-app` | native or cross-platform mobile apps | — |
| `data-engineering` | pipelines, ingestion, warehouse tables and schemas | `data-*` |
| `data-science` | analysis, metrics, statistics, notebooks, reports | — |
| `ml-ai` | models, training, evaluation, LLM pipelines and prompts outside the harness | — |
| `harness-engineering` | the agent harness: `~/.omp`, agents, skills, rules, hooks, omp extensions | `harness-*` |
| `iac` | Terraform, servers, DNS, volumes, firewalls, systemd, CI runners | `iac-*` |
| `blogging` | long-form articles, e.g. the Substack series | — |
| `marketing` | portfolio, resume, social media content | — |

## Git integration

Backlog.md sits on top of `skill://git-conventions`, which names no tracker.
There is no server watching PRs, so nothing moves a task for you: **the task
file changes in the same PR as the work**, and merging the PR is what lands
`Done` on `main`. Three things carry the task ID:

| where | form | why |
|---|---|---|
| branch | `bugfix/omp-12-null-cursor`, i.e. `<kind>/<id lowercased>-<slug>` | the prefix is the task's `kind` label, which the command guard's `branch-naming` check enforces |
| PR title | `fix(api): handle null cursor (OMP-12)` | squash-merge makes the PR title the commit on `main`, so the ID survives in history; the type comes from the kind (`skill://git-conventions` `## PR titles`) |
| PR body | `Closes OMP-12` (or `Part of OMP-12`) | a reader's link from the PR to the task; GitHub does not act on it |

- **Finishing a task, before the PR opens** (the finalization guide): check only
  proven acceptance criteria and DoD items (`--check-ac <n>`, `--check-dod <n>`),
  write `--final-summary` (what changed, why, the verification that ran, risks),
  set `For Review`, and commit the task file with the work. "Code presence, grep
  output, and implementation intent are not verification evidence."
- **Landing sets `Done`.** `pb-land`, once every PR in the run has its verdict and
  just before it merges, commits `Done` for every task the run closes on the
  ceiling branch — the top PR it will merge — so `main` only ever receives `Done`.
  Verdicts are tied to the patch without `backlog/`, so that commit does not void
  them (`pb-land`). A card carries no harness identity: a card is worked across
  sessions, models and omp versions, so one stamp on it would record a fact that
  does not exist. Which harness, omp build and model did the work is the commit
  trailer's job (`Agent-Identity:`, `skill://git-conventions`), where one commit
  really is one session.
- **Partial work**: a PR that does not finish the task leaves it `In Progress`,
  appends notes (`--append-notes`), and says `Part of <ID>` in the body.
- **Work resolved without code** (question answered, duplicate, won't do): final
  summary, `Done` or archive, committed on a `chore/` or `docs/` branch with
  whatever else is landing, or on its own small PR.
- **Release PRs are exempt.** release-please's `chore(main): release X.Y.Z` PR
  carries no task and no ID (`skill://git-conventions` `## Releases`).
- **A task's kind sets its version effect.** The kind picks the PR-title type, the
  title is the squash commit, and release-please reads that type: a `feature` task
  ships as a minor bump, a `bugfix` as a patch, and `docs`/`refactor` tasks appear
  in the release notes without a bump.
- **Cleanup**: `Done` tasks stay on the board until archived. `backlog cleanup` is
  interactive only; agents archive with `task archive <id>`, on a branch.

### Statuses

| status | means | set by |
|---|---|---|
| `To Do` | planned, nobody working on it | creation (the default) |
| `In Progress` | someone is building it now | the playbook run that starts it, with `--plan` |
| `For Review` | the work is finished and waiting to be verified or merged: a PR is open, or a gate, reviewer or the user has yet to accept it | `pb-open-pr` at finalization; a run that ends without a PR but needs acceptance |
| `Done` | verified and on trunk (or accepted, for work with no PR) | `pb-land` at landing; the accepting step for work with no PR |

- **Nothing sits in `To Do` or `In Progress` once it is ready to check.** A card
  whose PR is open, or whose work is waiting on a gate, is `For Review`; that is
  the column a reviewer, `pb-babysit` or the user reads to find what to verify.
- **A failed review moves it back** to `In Progress` with `--append-notes` saying
  what failed; it returns to `For Review` when the fix is pushed.
- **The CLI reads the checked-out branch; the board reads every active branch.**
  `backlog task list` and `task view` report the working tree's task files only —
  a card absent from the checkout is "not found" (`backlog task view` says so and
  points at `backlog browser`). The **board** is the surface that sees other
  branches: with `check_active_branches: true`, `backlog browser`'s `/api/tasks`
  returns a card committed on another branch as `source: "local-branch"`, and with
  `remote_operations: true` it fetches and returns `source: "remote"`. So a
  reviewer working from the CLI reads the PR branch (or the merged `main`), while
  the board shows a card's `For Review` before the branch merges (measured
  2026-10-19 on Backlog.md 1.54.0).

### Releases and milestones

A milestone is a **goal**: a set of tasks that together deliver one outcome, and its
title states the goal and nothing else (`agent-identity`, `harness-guards-and-ci`).
The release it ships in is **not** in the title. The user's decision of 2026-10-20
retired the `v0.N <goal>` prefix the 2026-10-19 rule had asked for: a goal is
sometimes released ahead of or behind the version a prefix would have named, so the
prefix read as a plan the release machinery could break, while the fact worth keeping
— the tag that actually shipped — is recorded on the milestone when it closes (below).
Nothing depended on the prefix for ordering: the board and `milestone list` order
milestones by ID (creation order), not by title. A goal that slips to a later release
now costs no rename at all. Two archived milestones keep a tag in their title —
`v0.7 backup-and-custody (omp-home-v0.7.0)` and `v0.6 backlog-workflow
(omp-home-v0.6.0)` — because they are records of what shipped and the tag there is the
point; do not rename them.

- **Create** with `backlog milestone add "<goal>" -d "<the outcome, one
  sentence>"` / `milestone_add`. The description cannot be edited afterwards through
  the CLI or MCP, so write it once, without placeholders.
- **Every open task has a milestone.** Plan tasks into a goal with `-m "<goal>"` when
  they are created. Work that serves no open goal — an unplanned fix, upkeep — goes
  in the standing `maintenance` milestone; when a goal fits better later, move it.
  `pb-open-pr` re-checks the milestone before the PR opens. Cards that shipped
  before the rule landed are grandfathered — do not reopen them to add a milestone.
- **`maintenance` is never complete and never archived.** Its tasks ship in
  whichever release comes next, which the time cap in `pb-release` guarantees.
  The release machinery must exempt it by name: a milestone with tasks flips to
  complete as soon as its last task is `Done`, so without the exemption the first
  unplanned fix landed under `maintenance` would make it complete, and the next
  release would rename and archive it (`pb-release`, `pb-land`).
- **Complete** when every task in it is `Done`. On a package repo, Done means
  merged, not released; `For Review` is not done.
- **Release** (package profile): `pb-release` cuts a release when a milestone
  completes, when the release PR has waited past the time cap, or on request.
  The release that ships a milestone's last task closes it: `milestone rename
  "<goal>" "<goal> (<tag>)"`, so the tag that actually shipped stays on the
  milestone and its tasks, then `milestone archive`. That tag is the only place a
  version appears on a milestone, and it is written once it is a fact.
- **Continuous profile**: milestones are goals only. Merge is ship, so there is no
  release to tie them to; archive one when its last task merges.
- **Abandoned goal**: when a goal is dropped or its tasks fit better elsewhere, move
  each open task (`-m "<other goal>"` or `-m maintenance`), then
  `backlog milestone remove "<title>"`; an empty milestone is archived, not
  deleted, so its ID and history stay.

## Importing old Linear tickets

Every issue of the retired Linear team `SOLO` (354, all projects, archived
included) was exported once to `~/.omp/backlog/linear-export.json`, committed in
omp-home: full descriptions, statuses, labels, dates, project and milestone. That
file is the only source; nothing contacts Linear.

**Import lazily**: a repo's tickets come over the first time that repo is worked
on after the migration, never in bulk ahead of need. They keep their `SOLO-<n>`
IDs for posterity; the live board keeps the repo's own prefix. One backlog cannot
hold both prefixes (above), so they live side by side:

| exported ticket | lands as | ID |
|---|---|---|
| every imported ticket | `backlog/linear/solo-<n> - <title>.md` — Backlog.md task format, full description, original status and dates, never read by the tool | `SOLO-<n>` |
| open (Backlog, Todo, In Progress) | also a live task created by the CLI, `Imported from SOLO-<n>.` first in its description, the old URL as `--ref`; criteria blocks in the description (`## Acceptance`, `## Done when`, `**Acceptance**`, `**Done when:** …`) become `--ac` items, and definition/evidence-of-done blocks `--dod` items | `<PREFIX>-<m>` |

`backlog search SOLO-<n>` finds the live task through its description; `rg
SOLO-<n> backlog/linear` finds the record. Ledger rows, branch names and PR
titles that cite `SOLO-<n>` stay as written.

Procedure, on the repo's work branch with its backlog initialised:

1. Find the repo's tickets in the export. Its `project` field is usually the
   repo directory name (list them all with `jq '[.[].project] | unique'`; the
   two `ContentCrunch MVP …` projects are the exceptions). Issues with no project
   (`project: null`, 33 of them) belong to whichever repo their title names;
   pick them by ID.
2. `bun ~/.omp/agent/skills/backlog-conventions/scripts/import-linear.ts
   <repo-root> <project>` (or `<repo-root> SOLO-81,SOLO-82`). It writes the
   `backlog/linear/` records, creates the live tasks through the CLI, prints a
   count that must equal the selection, and exits 1 on a selector that matches
   nothing. Re-running skips what is already imported. Dependency order is not
   preserved (`blockedBy` is not in the export); add `--dep` by hand where it
   matters.
3. Read the board (`backlog task list --plain`) and two records; commit
   `backlog/` on the branch.

## What agents must not do

- **Reconnect to Linear** or re-export from it; the committed export is final.
- **Hand-edit task files**, change `task_prefix`, or turn on `autoCommit`.
- **Create or start follow-up tasks** without the user's approval (the
  finalization guide). Propose them in the reply.

## Guards

| risk | control | why this and not more |
|---|---|---|
| new GitHub issue | command guard check `issues-in-backlog` (`hooks/pre/command-guard.ts`) | agents had filed ~120 open GitHub issues across 13 repos before a tracker was enforced |
| branch without the task's `kind` prefix | command guard check `branch-naming` | the prefix set and the `kind` label set are one list |
| a write to Linear after the cutover | no `linear` server in `mcp.json`; the export is a file | nothing to deny when nothing is connected |
| PR with no task ID | none: a convention, stated in `pb-open-pr` | no instance yet. Record a `DEFECTS.md` row when one is found |
