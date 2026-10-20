# Playbooks

This doc covers how committed work in this harness starts from a playbook: what a playbook is, where it lives on disk, how one gets picked, and how a run maps to a task. It also gives the recorded reason for each of those choices.
The procedures live in the playbooks and skills linked below. This doc explains why they look the way they do.

Paths are relative to `~/.omp/agent/` unless they start with `router:`, which means `~/repos/example-ext/`. Ledger rows are cited by date and scope.

## Taxonomy

Five artifact types hold standard work. `skill://playbook-or-skill` owns the table (`skills/playbook-or-skill/SKILL.md:10-16`):

| artifact | holds | named for | example |
|---|---|---|---|
| playbook (`pb-*`) | the ordered phases that one run of a kind of work goes through | the kind of work | `pb-feature` |
| skill | a standard for doing one step well in one domain or technology | the domain or technology | `semantic-modeling` |
| rule | a constraint that holds on every generation without being asked for | the constraint | `principle-prove-it-works` |
| hook | a guard that makes a wrong action impossible | the guarded action | the migration DROP guard |
| agent | a role for one domain, with tools, that autoloads the domain's skills | role and domain | `data-engineer` |

A playbook is still a skill. `AGENTS.md:116` says "One standard = one skill", and the router treats any non-hidden skill whose name starts with `pb-` as a playbook (`router:src/judges.ts:110-111`). `AGENTS.md` describes standard work in skill terms and does not mention playbooks or the `route` tool. Its committed-mode text tells the root to consult `WORKFLOWS.md` first and expect a hit (`AGENTS.md:80`).

Playbooks are named for the kind of work because one playbook can then serve every domain. The domain difference goes into a skill bound to an agent (see [Domain binding](#domain-binding)). The test is to write down the phases the work goes through in two domains. If the phases match, it is one playbook. If one domain has a phase the other lacks, it becomes a separate playbook, and a `pb-<domain>-<kind>` name is used only when the kind exists in that domain alone (`skills/playbook-or-skill/SKILL.md:32-35`). Before comparing phases, the author has to name any working incumbent. A named incumbent makes the work a replacement, which routes to `pb-refactoring` (`:22-30`).

Why: the model came from pstack@157aae39 and was adopted on 2026-10-01 (`skills/playbook-or-skill/SKILL.md:18`). The IMPROVEMENTS row 2026-10-01 "playbook-or-skill skill" records the cause: the rule "lived only in a session plan and the router convention doc; data playbooks were named by subsystem". The IMPROVEMENTS row 2026-10-01 "domain engineer/reviewer pairs replace the generic agents; pstack playbooks ported" gives the reasoning: "a playbook organises by kind of work, so one playbook serves every domain through a role table rather than one playbook per domain."

## On disk

Each playbook is a directory `skills/pb-<name>/` holding two files.

`SKILL.md` has frontmatter (`name`, `description`) and four sections in a fixed order: `## When`, `## Outcome`, `## Todo`, `## Done when`. `## When` carries a `Not:` line that names the neighbouring playbooks this one is not for. `## Todo` is a one-line pointer to the sidecar. `## Done when` ends with a `Reply:` bullet written per `skill://unslop` (`skills/playbook-or-skill/SKILL.md:59-68`). `skills/pb-feature/SKILL.md` is the template.

`todo.json` holds the phases and items as data:

```json
{"phases":[{"phase":"feature: orient","items":["[main] ...","[scout] ..."]}]}
```

The phase prefix is the playbook name without `pb-`. Phase names are unique, and item text does not repeat anywhere in the file. `(parallel)` marks a phase whose items are independent of each other. An item that contains the literal text `run pb-<name>` composes another playbook (`skills/playbook-or-skill/SKILL.md:69-79`).

Every item opens with a bracketed role list naming who does it. Roles are real agents, joined with `|` when more than one qualifies. The roles used across all 16 sidecars, parsed on 2026-10-11:

| role | resolves to |
|---|---|
| `[main]` | the calling session (`skills/operating-mode/SKILL.md:56-57`) |
| `[scout]` | the bundled read-only `scout` agent |
| `[task]` | the bundled general `task` agent, for anything outside the domain table |
| `[<domain>-engineer\|...]`, `[<domain>-reviewer\|...]` | the engineer/reviewer pair for harness, data, ux, app-backend and iac |
| `[data-designer\|app-backend-designer\|ux-designer\|task]` | the read-only designers, used in `pb-design`'s diverge phase |
| `[doc-writer]`, `[doc-reviewer]` | the docs pair |

A multi-domain item lists every qualifying engineer, for example `[app-backend-engineer|data-engineer|ux-engineer|iac-engineer|harness-engineer]`. The session picks the one whose domain matches what is being changed.

### Why phases are data

The sidecar exists because playbooks parsed from prose lost items twice.

- DEFECTS 2026-10-01T12:26z, corrected 2026-10-02T09:21z: a session routed to `pb-harness` and built its todo 40 minutes and about 30 tool calls after reading the skill. It wrote 3 phases and 12 items where the playbook had 6 phases and 16, and it dropped the blindspot-search item that would have stopped the build. `router:specs/SPEC.md:94-100` cites this as the reason the route result carries the phases.
- `router:DEFECTS.md` 2026-10-02 (`phasesOf` heading fallback): of 47 routes that named a playbook, 43 carried phases with `items: []` and 88 items were dropped across 12 playbooks, because no global `pb-*` shipped a `todo.json` and the fallback kept only `###` headings.

The sidecar is now required and is the only source of a playbook's todo. `SKILL.md` is never parsed for phases (`router:specs/SPEC.md:109-118`, BC12 at `:263-270`). A `pb-*` skill with a missing or invalid sidecar is excluded from the catalog, and a warning names it at session start (BC23, `:300-305`).

### Why roles are inline

IMPROVEMENTS 2026-10-03 "playbooks name qualifying agents inline": items used to say `[domain-engineer]` and depend on `skill://operating-mode` to resolve it, but that skill "was read once across the whole session corpus". The fix names the agents in the item itself.

## The playbooks

Seventeen directories match `skills/pb-*/` as of 2026-10-18. Each one-line summary comes from the playbook's `description`. Phase and item counts and the `run pb-*` targets come from parsing each `todo.json`.

| playbook | what it does | phases / items | composes |
|---|---|---|---|
| [`pb-babysit`](../skills/pb-babysit/SKILL.md) | Drives an open PR or stack to merge-ready (conflicts, review threads, CI) and stops where a human must act. Only on an explicit request. | 5 / 9 | none |
| [`pb-bugfix`](../skills/pb-bugfix/SKILL.md) | Reproduces a reported defect on the real surface, root-causes it with runtime evidence, fixes only what the evidence justifies, and proves the repro passes. | 5 / 8 | `pb-design`, `pb-open-pr` |
| [`pb-data-quality-incident`](../skills/data/pb-data-quality-incident/SKILL.md) | Handles one data-quality incident: blast radius from real rows, root cause written before the fix, one fix, re-test, record. | 5 / 5 | `pb-open-pr` |
| [`pb-data-schema-migration`](../skills/data/pb-data-schema-migration/SKILL.md) | Changes one DuckDB or SQLite schema through a migration that ships with its code. Additive by default, verified on a copy of the store. | 5 / 6 | `pb-open-pr` |
| [`pb-data-source-onboarding`](../skills/data/pb-data-source-onboarding/SKILL.md) | Adds one new data source end to end against an existing source contract, smoke-proven on one real item, with a dropout guardrail. | 5 / 7 | `pb-source-discovery`, `pb-design`, `pb-feature`, `pb-open-pr` |
| [`pb-design`](../skills/pb-design/SKILL.md) | Turns an approved spec into `design.md`: research, risk sizing, spike decision, 2-3 whole-shape candidates, red-flag screen, review. | 10 / 16 | `pb-spec`, `pb-feature`, `pb-bugfix`, `pb-refactoring` |
| [`pb-feature`](../skills/pb-feature/SKILL.md) | Adds or changes behaviour from a named data shape: orient, design, build through a delegate, verify on the real surface, land. | 5 / 14 | `pb-design`, `pb-open-pr` |
| [`pb-investigation`](../skills/pb-investigation/SKILL.md) | Answers a read-only question with a written, cited explanation or recommendation. Never a code change. | 2 / 4 | none |
| [`pb-kaizen`](../skills/pb-kaizen/SKILL.md) | Runs a retrospective, post-mortem or improvement pass over a named subject and proposes countermeasures. The human decides. Not mid-task. | 4 / 7 | none |
| [`pb-land`](../skills/pb-land/SKILL.md) | Lands a verified PR or stack into trunk: verifies each PR independently (or records the narrow self-verified exception), then squash-merges the contiguous verified run with `gh stack`, and reports any milestone it completed. | 5 / 12 | `pb-release` |
| [`pb-maturity-assessment`](../skills/data/pb-maturity-assessment/SKILL.md) | Declares maturity on the domain's ladder and what that level makes proportionate. | 3 / 3 | none |
| [`pb-new-project`](../skills/pb-new-project/SKILL.md) | Bootstraps a new repo, project, document set, channel or media library: backlog, repo, git files, release setup, ledgers. | 6 / 17 | `pb-open-pr`, `pb-land` |
| [`pb-open-pr`](../skills/pb-open-pr/SKILL.md) | Opens ready PRs — one, independent, or a `gh stack` — each with the body its task's kind needs, verification a reviewer can rerun, and links to its task, milestone and the artifacts it answers. Runs at the end of other playbooks. | 4 / 14 | none |
| [`pb-refactoring`](../skills/pb-refactoring/SKILL.md) | Changes structure without changing behaviour, with the contract pinned before and proven after. | 5 / 9 | `pb-design`, `pb-open-pr` |
| [`pb-release`](../skills/pb-release/SKILL.md) | Cuts a release in a package-profile repo: decides the window from milestones and a 7-day cap, checks release-please's version and notes, merges the release PR, verifies tag, Release and artifact, archives the milestone with the tag in its title (never `maintenance`). | 5 / 9 | none |
| [`pb-source-discovery`](../skills/data/pb-source-discovery/SKILL.md) | Recons an unknown source: classify, cheap evidence, budgeted probes, gated contract. | 6 / 10 | `pb-data-source-onboarding` |
| [`pb-spec`](../skills/pb-spec/SKILL.md) | Writes a behavioural spec (what and why) through `doc-writer`, clarifies every open question with the user, then lints and reviews it. | 5 / 7 | none |

`WORKFLOWS.md:30-57` indexes all seventeen with a "run it when" trigger.

The usual chain for new behaviour is `pb-spec`, then `pb-design`, then `pb-feature`, `pb-bugfix` or `pb-refactoring`, with each step able to call the previous one through `run pb-X`. The split was decided on 2026-10-03: "the spec says what, and pb-spec writes it; the design says how, and pb-design writes it from an approved spec" (`docs/playbook-refactor-plan.md:74-79`).

## Selection and running

### The router

**Uninstalled 2026-10-17** (`omp plugin uninstall playbook-router`): its status line collided with the Tern terminal UI, and the extension is due a rework. Playbooks are invoked manually until it is reinstalled. The package source at `~/repos/example-ext` is unchanged; the description below is of that source, not of a running extension.

The router is an omp extension package, `playbook-router` (version 1.6.2, `router:package.json:3`). It ships one routing rule and one `route` tool. It ships no playbooks and keeps no playbook registry, because omp's skill listing is the menu (`router:README.md:18-20,42`). `router:specs/SPEC.md` is the authority on its behaviour (`router:AGENTS.md:40`).

It exists to serve operating principle 1, "every repeated process should become standard work", with dated instances as the evidence bar. It does this in two ways. It makes the agent start committed work from a playbook, and it records which standard ran, so that work matching no playbook becomes dated evidence for `imp-standardize` (`router:specs/SPEC.md:10-14`).

The run goes like this:

1. The rule tells the main agent to call `route` when a message starts or changes committed work, meaning it changes files, systems or published artifacts. Chat, questions, status requests and continuations make no call. Not calling is itself the triage (`router:rules/playbook-routing.md:6`, BC1 and BC30).
2. The call carries `intent` (one line), `playbooks` (the matching `pb-*` names) and an optional `resolution` (`router:index.ts:933-937`). The catalog the agent can name is every non-hidden `pb-*` skill with a valid sidecar (`router:index.ts:75-99`). A name outside the catalog is rejected (BC8).
3. A configured decider settles the playbook set. With `playbooks: session`, the default, the agent's own proposal stands. With `playbooks: model`, a router model answers one yes/no question per catalog playbook (`router:specs/SPEC.md:185-213`).
4. The result is one immutable `Decision` stored as the tool result's `details`. omp persists it in the session, so it branches, compacts and resumes with the session, and the router keeps no store of its own (`router:specs/SPEC.md:67-88`).
5. The result carries each routed playbook's sidecar phases verbatim and ends with the exact `todo` `init` payload. The agent copies it into the todo instead of rebuilding the todo from memory (BC12; `router:rules/playbook-routing.md:10`).

The route kind is the number of playbooks in the decision (BC3, `router:specs/SPEC.md:120-129`):

| `playbooks` | kind | meaning |
|---|---|---|
| `[]` | non-standard | no playbook fits |
| `[x]` | playbook | one standard covers the work |
| `[x, y, …]` | composite | no single playbook covers it. A recurring composite is a missing composite playbook |

Composition through `run pb-X` items counts as one route. If a routed playbook's sidecar composes another routed playbook, the composed one is dropped from the route unless the two compose each other in a cycle. The remaining phases are merged in route order, and duplicate phase names and item text are removed (BC27).

When a new route arrives while a todo is still open, the router classifies it (BC19). The same playbook set continues. A changed set raises a steer, which resolves as `switch`, `fold`, `defer` or `continue`, decided by the session, a model, or the human depending on the `disposition` setting (`router:rules/playbook-routing.md:12`). A non-standard route or `[pb-investigation]` over an open todo always continues, so an ad hoc question never steers the plan.

`strict` is `false` by default. Under that default the router records and displays decisions and binds nothing. Under `strict: true` it rewrites a todo `init` to include the routed phases and blocks the settle at turn end at most once, and it never blocks a tool call (`router:specs/SPEC.md:19-20`, BC13, BC16). Every profile records a decision. At settle, mutating tool calls with no `route` since the last human message are recorded as `unrouted_work` (BC31).

The global state, read on 2026-10-17:

- The plugin is uninstalled: `~/.omp/plugins/omp-plugins.lock.json` has no `playbook-router` entry, so no session gets the `route` tool or the routing rule. When it was installed (read 2026-10-11) it ran the `quiet` profile with a router model set and `triage: model` (`router:specs/SPEC.md:201`).
- The `disabledExtensions: [rule:playbook-routing]` line that arrived with commit `d77e0a3` (PR #38, 2026-10-10) without a recorded rationale was removed with the uninstall; it had left sessions with the `route` tool but without the rule saying when to call it.
- The router's decision evals put the default `session` decider at 37.1% accuracy on 35 labelled routes and the model decider at 75.0% of the 32 it acted on. Both numbers come from one recorded run and the sample is small (`router:AGENTS.md:86-93`; `router:DEFECTS.md` 2026-10-08, "the default `playbooks: session` decider").

The why behind the router's shape (observe-only, riding native events, no registry) is in [harness-engineering.md](harness-engineering.md) under "The platform is already rich". The first implementation kept a maintained registry, an injected menu and a session toggle, and it was retired.

### Sensors

`docs/queries/playbook-routes.sql` reads every `route` result from the session transcripts. `FEEDBACK.md:19-24` names the signals: decisions per commitment, committed work with no decision, non-standard routes clustered by intent, composite routes, judge disagreement, and judge faults.

### playbook-probe (removed)

`extensions/playbook-probe/index.ts` was an observe-only extension for the router's phase 0. It wrote one JSON line per observed event to `playbook-probe/events.jsonl`. The router's archived WP1 plan used it to answer the spec's open omp-API questions and ends with "Remove the probe." (`router:tasks/plans/archive/playbook-router.md:40-48`). It was not removed then, and was still writing on 2026-10-17, when the file had reached 1,119,269,677 bytes. The extension was deleted with the router uninstall on 2026-10-17. Its `events.jsonl` is observed data: it stays on disk and stays gitignored (`.gitignore:88`) until someone decides to archive or delete it.

## Domain binding

Playbook items name agents. Domain standards reach those agents in three places (`skills/playbook-or-skill/SKILL.md:44-55`):

1. the domain table in `skill://operating-mode`, which gives each domain an engineer, a reviewer and, where trialled, a designer (`skills/operating-mode/SKILL.md:25-33`);
2. each agent's `autoloadSkills`;
3. project skills under a repo's `.omp/skills/`.

To add a domain to a playbook, add a skill and bind it in one of those places. The playbook itself is not forked.

The proving surface for each domain is a row in the owning scope's `VERIFY.md`, which the engineer and reviewer find at runtime through `skill://scope-registers`. A scope with no `VERIFY.md` gives a reviewer verdict of INCONCLUSIVE, not a pass (`skills/operating-mode/SKILL.md:20-23`).

Why pairs: IMPROVEMENTS 2026-10-01 "domain engineer/reviewer pairs replace the generic agents". The generic `implementer` and `reviewer` "had to be told the whole harness in each brief". A pair that autoloads its domain skills and carries rules scoped by an `agents:` glob does not need a universal prompt. IMPROVEMENTS 2026-10-09 "the *-worker class retired" removed the full-loop workers (`ux-worker`, `frontend`, `frontend-craft`, `iac-worker`, `sdlc-worker`). A worker that dispatched its own implementer nested a task inside a task, and `ux-worker`'s changelog recorded four consecutive dispatches dying that way. The same change moved 17 `[main]` file-work items to engineers, `scout` or `doc-writer`. IMPROVEMENTS 2026-10-09 "code-craft rules scoped to engineer agents" scoped the implementation-craft principles to `*-engineer` and repointed the playbook items that cited them.

## Lint and index

| check | what it checks | state on 2026-10-11 |
|---|---|---|
| the playbook router's `scripts/lint-playbooks.ts` | sidecar shape through the router's own `phasesFromSidecar`; the four `SKILL.md` sections with `Not:` and `Reply:`; every role names an agent in `agents/` or a bundled one (`main`, `task`, `scout`, `reviewer`, `security-reviewer`, `sonic`); every `run pb-X` resolves; no duplicated item text. A skills directory that is not there, or that holds no `pb-*` playbook, is reported rather than passed. The checks are listed in the file's own header (`router:scripts/lint-playbooks.ts`). | exit 0 when run by hand. Manual-only: the pre-commit gate has been commented out since 2026-10-09 (`~/.git-hooks/pre-commit:76-95`). It left this repo's `scripts/` for the repo that owns its parser on 2026-10-19 (OMP-28); the router's row in `VERIFY.md` runs it by its new path. The router repo is private, so this published page does not name it |
| `scripts/playbook-index-check.py` | every `pb-*` directory is named in `WORKFLOWS.md`, and every `skills/<name>/` path the index names exists (`scripts/playbook-index-check.py:4-15`) | exit 0 (2026-10-13): all 16 playbooks indexed, all 39 indexed skills resolve — the dangling `harness-audit` row (exit 1 on 2026-10-11) was removed in SOLO-243 |

Why the lint: the plan's U6 unit (`docs/playbook-refactor-plan.md:250-272`) moved authoring rules "that currently live in people's heads" into a check, and it landed in PR #27. IMPROVEMENTS 2026-10-09 "playbook pre-commit lint disabled (temporary)" turned the gate off because the playbooks were "about to be reworked for format and content", which made the lint's `Not:`, `Reply:` and role rules "stale by design". The follow-up is to re-arm the gate when the rework lands. The two 2026-10-11 label-taxonomy rows record "Lint exit 0" from manual runs.

Why the index check: a `pb-*` skill is routable as soon as its directory exists, whether or not `WORKFLOWS.md` names it, so "the index quietly stops being the menu" (`scripts/playbook-index-check.py:6-8`). It was built when the first playbook landed (IMPROVEMENTS 2026-09-30 "the harness-engineering standard").

### Evidence bar

`skill://imp-standardize` owns the bar: "dated evidence in ≥2 repos with ≥3 instances, or ≥5 instances in one repo. Below it this is a task, not a standard" (`skills/imp-standardize/SKILL.md:35-37`). `AGENTS.md:155-159` and `WORKFLOWS.md:105-106` repeat it.

The ported playbooks were not admitted on local evidence. `WORKFLOWS.md:60-63` records that they were ported from pstack@157aae39 (MIT) on 2026-10-01 and are "proven upstream, not by our dated instances". Local evidence builds up as `route` decisions. The three `pb-data-*` playbooks rest on the evidence rows for the `de-*` agents (`WORKFLOWS.md:186-196`). A new kind of work starts under `pb-spec` and goes through `pb-design`. Routine edits to an existing playbook go through `pb-feature` (`skills/playbook-or-skill/SKILL.md:89-91`).

## Tasks

Every run of `pb-spec`, `pb-design`, `pb-feature`, `pb-bugfix`, `pb-refactoring` and `pb-kaizen` works on its own task, labelled with the run's kind. A run handed on by another depends on it: the design task has `--dep <spec task>`, and the feature task `--dep <design task>`. The task file changes in the same PR as the work, carrying `For Review` while the PR is open, and `pb-land` commits `Done` on the ceiling branch before the merge — so the merge lands `Done` on `main` (`skills/backlog-conventions/SKILL.md` `## Tasks`, `## Git integration`). Each of those six sidecars opens with a `[main]` item that finds or creates the task and sets it In Progress, for example `skills/pb-feature/todo.json:6`.

The `kind` label maps work to playbooks (`skills/backlog-conventions/SKILL.md` `### kind`):

| kind | playbook |
|---|---|
| `bugfix` | `pb-bugfix`, `pb-data-quality-incident` |
| `feature` | `pb-feature` |
| `refactor` | `pb-refactoring` |
| `spec` | `pb-spec` |
| `design` | `pb-design` |
| `investigation` | `pb-investigation`, `pb-source-discovery` |
| `migration` | `pb-data-schema-migration` |
| `chore` | `pb-new-project` |
| `continuous-improvement` | `pb-kaizen` |
| `docs`, `content` | none yet |

The task's ID names the branch (`<kind>/<id lowercased>-<slug>`, e.g. `bugfix/omp-12-null-cursor`), and `pb-open-pr` puts it in the PR. The title ends with `(OMP-12)` so the squash commit on `main` keeps it. The body opens with `Closes OMP-12`, or `Part of OMP-12` when more PRs follow. release-please's release PR is exempt (`skills/pb-open-pr/todo.json:15`; `skills/backlog-conventions/SKILL.md` `## Git integration`). [guards.md](guards.md) covers why branch prefixes follow `kind` and how the command guard enforces them.

Why: IMPROVEMENTS 2026-10-11 "Linear `kind` × `domain` label taxonomy". Only `pb-bugfix` created a card, "so most work would never appear in Linear", and the labels described neither the kind of work nor its domain. Linear's single-select label groups reject a second `kind` server-side, so the harness needs no check for it. IMPROVEMENTS 2026-10-11 "`kind` gains `docs` and `continuous-improvement`" added those two kinds after the user corrected the first taxonomy. The tracker is Backlog.md now, and [config.md](config.md) covers the MCP servers and the lazy import of the old Linear tickets.

omp-home is versioned by release-please from SOLO-99 on, with `version.txt` plus the commit SHA identifying a harness ([config.md](config.md#release-profile-and-harness-version)) — the commit trailer carries it, and OMP-42 removed the per-card stamp that duplicated it. OMP-15 (was SOLO-87, `handoff.sh` makes non-conventional branches) and OMP-13 (was SOLO-88, the branch matcher reads text instead of shell structure) are gaps in the branch conventions the tasks rely on.

## Non-standard work

When no playbook fits, the route is `[]`. `AGENTS.md:82` sets the expectation: such work is "unproven by definition". Plan it from scratch in the same structure, say plainly that it is non-standard, and expect to supervise it with a fresh-context reviewer, a real-data smoke before it runs at size, a resumable checkpoint, and someone reading the output. If the run works, it becomes the evidence `imp-standardize` needs.

`FEEDBACK.md:21` clusters `[]` routes by intent. A cluster that reaches the evidence bar is a candidate for `imp-standardize`.

Why: IMPROVEMENTS 2026-09-28 "committed mode rewritten around standard work". The old text treated a matching standard as a conditional ("if one matches") and gave no cost for the unstandardised path. The rewrite makes standard work the expected case and names the supervision non-standard work needs.

## History

| date | change | source |
|---|---|---|
| 2026-09-28 | Subagent factory retired. `workflow-factory`, `/create-workflow` and `workflow-contract` deleted. Reason: "the standard must precede the machinery that automates it" | IMPROVEMENTS 2026-09-28 "standard work" and "removing the factory"; `AGENTS.md:161-175` |
| 2026-09-28 | `workflow.yaml` graphs removed. Every agent body already held its graph node for node as a numbered procedure | IMPROVEMENTS 2026-09-28 "removing the workflow graphs"; `WORKFLOWS.md:155-161` |
| 2026-09-30 | First playbook, `pb-harness`, plus `playbook-index-check.py` | IMPROVEMENTS 2026-09-30 "the harness-engineering standard" |
| 2026-10-01 | Engineer/reviewer pairs and `operating-mode` added. The pstack-shaped playbooks and three `pb-data-*` ported (PR #17) | IMPROVEMENTS 2026-10-01 "domain engineer/reviewer pairs ..." |
| 2026-10-01 | `playbook-or-skill` written | IMPROVEMENTS 2026-10-01 "playbook-or-skill skill" |
| 2026-10-02 | Router requires a `todo.json` sidecar after 88 items were dropped | `router:DEFECTS.md` 2026-10-02 |
| 2026-10-03 | Playbook items name qualifying agents inline | IMPROVEMENTS 2026-10-03 |
| 2026-10-03 | `pb-spec` and `pb-design` added, `pb-harness` dissolved, designers and lints added (PR #27) | git `8f1f8e6`. No IMPROVEMENTS row |
| 2026-10-06 | `pb-new-project` added | git `178a680` |
| 2026-10-09 | `*-worker` agents retired. Code-craft rules scoped to engineers. Pre-commit playbook lint disabled | IMPROVEMENTS 2026-10-09, three rows |
| 2026-10-10 | `pb-source-discovery` and `pb-maturity-assessment` landed (PR #38) | git `d77e0a3` |
| 2026-10-11 | Linear becomes the tracker, with one card per playbook run and `kind` × `domain` labels | IMPROVEMENTS 2026-10-11, rows "Linear MCP wired", "`linear-conventions` skill", "Linear is the issue tracker", "label taxonomy", "`kind` gains `docs`" |

### What remains of the factory

The factory stamped nine `de-*` agents, and they still live in `~/repos/the data-platform repo/.omp/agents/`. Each one is a definition plus a changelog, with its procedure as numbered steps in the body. Their file contract is [workflow-agent-contract.md](workflow-agent-contract.md). No new stamps are made. A hard-won guardrail in one of them moves into standard work through `imp-standardize`: "the graph is dropped, the learning is kept" (`AGENTS.md:170-175`; `WORKFLOWS.md:130-153`). Three of them have playbook successors (`pb-data-source-onboarding`, `pb-data-quality-incident`, `pb-data-schema-migration`). The other six are not yet standardised (`WORKFLOWS.md:83-88`).

### The refactor plan

[playbook-refactor-plan.md](playbook-refactor-plan.md) was proposed in PR #24 (`7cfd624`) and implemented the same day in PR #27 (`8f1f8e6`): git precedence (U1), `pb-spec` and `pb-design` (U2), dissolving `pb-harness` (U3), proving surfaces moved into `VERIFY.md` (U5), `lint-playbooks.ts` (U6, moved to the playbook router's repo on 2026-10-19), and the data and app-backend designers (U7). U4's harness standards went into the existing `harness-engineering` skill instead of a new `harness-standards` skill. U6's lint does not compare `## Todo` headings with sidecar phases, because `## Todo` is now a one-line pointer. Until this doc landed, the plan's header still read "for approval, not implemented"; it now records the implementation.

## Open gaps

Facts found while writing this doc. None of them are fixed here.

- No IMPROVEMENTS row records PR #27 implementing the refactor plan.
- The router's `disabledExtensions` line and the probe still writing were both resolved by the 2026-10-17 uninstall (see [The router](#the-router)).
- The pre-commit playbook lint has been disabled since 2026-10-09, pending a rework.
- `skill://operating-mode` lists the ux designer as "trial pending", but `agents/ux-designer.md` exists and `pb-design` dispatches it. Its line 56 still describes `domain-` prefixed roles, and none remain in any sidecar.
- The router convention caps a description at twelve words and 100 characters (`router:docs/extension/convention.md:9`). Most `pb-*` descriptions are longer.
- `WORKFLOWS.md:23-24` holds domain standards to the `imp-standardize` constraints, including at most five steps. `pb-design` has 10 phases and `pb-feature` has 14 items.
- The kind table maps `pb-data-quality-incident`, `pb-investigation`, `pb-source-discovery` and `pb-data-schema-migration` to kinds, but they carry no find-or-create task item. Six playbooks find or create one; `pb-new-project` creates its project's first task (`chore`) in its track phase.

## Sources

- `AGENTS.md:74-92` (Execution Modes), `:113-175` (Standard work, evidence bar, factory retired)
- `WORKFLOWS.md:11-63`, `:95-116`, `:130-208`
- `skills/playbook-or-skill/SKILL.md`, `skills/operating-mode/SKILL.md`, `skills/scope-registers/SKILL.md`, `skills/imp-standardize/SKILL.md:35-43`, `skills/backlog-conventions/SKILL.md`
- `skills/pb-*/SKILL.md` and `skills/pb-*/todo.json` (16 directories)
- the playbook router's `scripts/lint-playbooks.ts` (this repo's `scripts/lint-playbooks.ts` until 2026-10-19), `scripts/playbook-index-check.py`, `VERIFY.md:36,38`, `FEEDBACK.md:19-24`, `docs/queries/playbook-routes.sql`
- `extensions/playbook-probe/index.ts` and `config.yml:75-76` (both removed 2026-10-17; read them at `d77e0a3`), `~/.omp/plugins/omp-plugins.lock.json`, `~/.git-hooks/pre-commit:76-95`
- `docs/playbook-refactor-plan.md`; git `e63e1f7` (#17), `7cfd624` (#24), `8f1f8e6` (#27), `178a680`, `d77e0a3` (#38)
- `IMPROVEMENTS.md` rows 2026-09-28 (standard work; removing the factory; removing the workflow graphs; committed mode rewritten), 2026-09-30 (harness-engineering standard), 2026-10-01 (domain pairs and pstack port; playbook-or-skill), 2026-10-03 (inline agents), 2026-10-09 (worker class retired; code-craft rules scoped; lint disabled), 2026-10-11 (Linear rows)
- `DEFECTS.md` rows 2026-10-01T12:26z and 2026-10-02T09:21z
- `router:README.md`, `router:AGENTS.md`, `router:specs/SPEC.md` (Intent, Data model, Config, BC1-BC31), `router:rules/playbook-routing.md`, `router:index.ts:75-99,933-937`, `router:src/judges.ts:110-111`, `router:docs/extension/convention.md`, `router:DEFECTS.md` rows 2026-10-02 and 2026-10-08, `router:tasks/plans/archive/playbook-router.md:40-48`
- Linear SOLO-86, SOLO-87, SOLO-88
