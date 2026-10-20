# WORKFLOWS — index of standard work

**One standard = one skill.** This file is the **index**: what standard work
exists, where it lives, and what triggers it. The procedures themselves live in
their skill and are never duplicated here — a restated procedure is a second copy,
and the two drift.

Consult this when entering committed mode, and when deciding whether a process you
are about to improvise already has a standard.

## Standard work

| standard | home | run it when |
|---|---|---|
| `imp-setup` | `skills/imp-setup/SKILL.md` | a new or inherited scope has nowhere to record what breaks, changes, senses or proves — establishes the four ledgers, plan/apply |
| `imp-defect` | `skills/imp-defect/SKILL.md` | something broke, a guard failed to fire, or a near-miss happened — one row per instance in the owning scope's `DEFECTS.md` |
| `imp-feedback` | `skills/imp-feedback/SKILL.md` | you add a sensor, or ask what would have seen a failure — a row in the owning scope's `FEEDBACK.md` |
| `imp-change` | `skills/imp-change/SKILL.md` | you land a fix, improvement or guard — the `IMPROVEMENTS.md` row and the commit |
| `imp-verify` | `skills/imp-verify/SKILL.md` | you add a check, or one is re-homed or retired — the `VERIFY.md` row and its `goes red` case |
| `imp-kaizen` | `skills/imp-kaizen/SKILL.md` | a retrospective, post mortem or improvement pass over a named subject |
| `imp-standardize` | `skills/imp-standardize/SKILL.md` | a repeated process is still improvised — write the standard work, and install the rule / hook / script it needs |

**Domain standards** — the processes one field actually repeats. Indexed here, and
held to the same constraints as the operations above.

| standard | home | run it when |
|---|---|---|
| `backlog-conventions` | `skills/backlog-conventions/SKILL.md` | creating or updating tasks, filing a bug, opening a PR, planning a release, or starting work in a repo with no `backlog/` yet — task shape, kind and domain labels, priority, milestones, and the branch / PR-title / PR-body links that carry the task ID |
| `harness-engineering` | `skills/harness-engineering/SKILL.md` | the harness standard autoloaded by harness-engineer and harness-reviewer — research the native surface first, prove in a fresh process, land recoverable |
| `eval` | `skills/eval/SKILL.md` | a trial's outcome will be cited, published or compared, or a harness config is to be benchmarked against an agent release — read both mirror pins off a job in `evals/`, approve the size and cost before a billed launch, and record what the result was measured against. Entry point `/eval`; harbor runs the trial and owns every flag (`skill://harbor-cli`). Shortlist: `skills/eval/references/benchmarks.md` |
| `pb-spec` | `skills/pb-spec/SKILL.md` | behaviour needs agreeing before design — writes a testable behavioural spec |
| `pb-design` | `skills/pb-design/SKILL.md` | an approved spec needs a design — research, depth, spike decision, 2-3 candidates, review |
| `data-design-standards` | `skills/data/data-design-standards/SKILL.md` | autoloaded by data-designer — data design checklist |
| `ingestion-standards` | `skills/data/ingestion-standards/SKILL.md` | writing or reviewing ingestion code — the normative MUSTs (per-source contract adapting dlt/Airbyte vocabulary, resilience and 429 handling, special statuses, raw landing before parsing, partial progress, probe budgets, transport conformance pins), each tagged with the lowest platform stage it applies at |
| `ingestion-best-practices` | `skills/data/ingestion-best-practices/SKILL.md` | ingestion techniques, gotchas and per-source-type discovery methods — advisory, the how-to pair of `ingestion-standards` |
| `app-design-standards` | `skills/app-design-standards/SKILL.md` | autoloaded by app-backend-designer — service design checklist |
| `operating-mode` | `skills/operating-mode/SKILL.md` | playbook items name the qualifying agents inline, or a step says "verify on the matching surface" — explains which domain each agent covers and names the proving surface |
| `scope-registers` | `skills/scope-registers/SKILL.md` | an engineer or reviewer starts work — finds the owning scope's `VERIFY.md` and `FEEDBACK.md` and selects the rows covering the files it will touch |
| `provider-optimize` | `skills/provider-optimize/SKILL.md` | a model routes through OpenRouter and the question is which upstream provider to use, whether a discount is worth taking, or how to cut cost — reviews every configured model and reads each one's pareto frontier (cost · precision · uptime) plus fallback layers. Model-agnostic; **OpenRouter only for now**. **New 2026-10-12, unproven: watch it before treating it as settled.** |
| `how` | `skills/how/SKILL.md` | "how does X work", a walkthrough before changing something, or a placement / ownership / layering question — produces an architectural explanation |
| `unslop` | `skills/unslop/SKILL.md` | any writing is finished — cuts AI tells from prose |
| `tdd` | `skills/tdd/SKILL.md` | a bug has a cheap local test path, or the user asks for TDD — makes the broken behaviour executable before the fix |
| `playbook-or-skill` | `skills/playbook-or-skill/SKILL.md` | new standard work is being written — decides playbook vs skill vs rule vs hook vs agent, and names it by kind of work |
| `pb-investigation` | `skills/pb-investigation/SKILL.md` | a read-only question ends in a written, cited deliverable |
| `pb-bugfix` | `skills/pb-bugfix/SKILL.md` | a reported defect needs reproducing, root-causing and proving fixed |
| `pb-feature` | `skills/pb-feature/SKILL.md` | behaviour is added or changed |
| `pb-new-project` | `skills/pb-new-project/SKILL.md` | a new scope is started — Backlog.md backlog and bootstrap task, repo on a branch, README/LICENSE/AGENTS.md, the git files and release setup from `git-conventions`, ledgers, one squash-merged PR, verified on a fresh clone |
| `pb-refactoring` | `skills/pb-refactoring/SKILL.md` | structure changes with behaviour held constant |
| `pb-open-pr` | `skills/pb-open-pr/SKILL.md` | the end of any playbook that changed files — open a ready PR |
| `pb-babysit` | `skills/pb-babysit/SKILL.md` | drive an open PR or stack to merge-ready, or "check on PR N" |
| `pb-land` | `skills/pb-land/SKILL.md` | merge, land or merge-when-ready a verified PR or stack into trunk (not a release) |
| `pb-release` | `skills/pb-release/SKILL.md` | cut a release in a package-profile repo: a milestone is complete, the release PR has waited 7 days, or the user asks — merge the release PR, verify tag, Release and artifact, archive the milestone |
| `pb-kaizen` | `skills/pb-kaizen/SKILL.md` | a retrospective, post-mortem or improvement pass over a named subject |
| `pb-source-discovery` | `skills/data/pb-source-discovery/SKILL.md` | a new source whose behaviour or transport is unknown — classify the source, recon cheap documented evidence first, probe under a declared request/time/cost budget, record the per-source contract, build the re-runnable investigation notebook (`docs/source-discovery/<source>.ipynb`), gate both |
| `pb-maturity-assessment` | `skills/data/pb-maturity-assessment/SKILL.md` | before applying stage-indexed standards — declare the platform's maturity stage from the domain's own ladder so requirements stay proportionate |
| `pb-data-source-onboarding` | `skills/data/pb-data-source-onboarding/SKILL.md` | onboard ONE new data source end to end |
| `pb-data-quality-incident` | `skills/data/pb-data-quality-incident/SKILL.md` | handle ONE data-quality incident |
| `pb-data-schema-migration` | `skills/data/pb-data-schema-migration/SKILL.md` | change ONE schema through a migration that ships with its code |
| `deep-research` | `skills/deep-research/SKILL.md` | a question needs multi-hop, source-heavy research (comparative analyses, literature surveys, due diligence) — runs Perplexity Deep Research on the Pro subscription via `pwm`, on demand only |
| `weighted-loc` | `skills/weighted-loc/SKILL.md` | asked to analyze a codebase's complexity, technical debt, or how much custom code it holds — tiers every block by the framework/idiomatic leverage it takes, reports weighted LOC with a file tree, and flags blocks that re-implement what a framework already provides |
| `herdr-conventions` | `skills/herdr-conventions/SKILL.md` | a task mentions herdr, an agent pane must be started or inspected, a worktree-backed workspace must be created, or several main sessions must work at once — the gate, the house rules, and the omp guard seam that decides which directory a session must run in |

Ported from pstack@157aae39 (MIT) on 2026-10-01 — proven upstream, not by our
dated instances; local evidence accrues as `route` decisions
(`docs/queries/playbook-routes.sql`). The three `pb-data-*` rest on the `de-*`
evidence rows below.

Evidence for `new-project` (now `pb-new-project`; collected 2026-09-28, before it was written): 160 git
repos in `~/repos`, `README.md` in 117 of them, `LICENSE` in 51, `AGENTS.md` in
47, `docs/` in 53. Far past the bar — and the variance is the point, not the
coverage: first commits range from `init` to `chore(scaffold): init Python repo
and Typst build pipeline`, under two different author identities.

Evidence for `harness-engineering` (collected 2026-09-30, before
they were written): the `~/.omp` harness repo landed PRs #2–#12 in three days —
the factory becoming standard work, `new-project`, two guard-matcher fixes each
with an observed red case, and the router's visibility and display fixes; the
playbook-router extension went spec → installed over WP0–WP7 with a defect and
changelog row per cycle, then rewritten a second time (v3: one `route` tool, one stored
decision, three judge strategies) with a defect, changelog and verify row per cycle; the
router was trialled live and its defects reported from real sessions; nine `de-*` agent definitions and their changelogs were
maintained in `the data-platform repo/.omp/agents/`. Four repos, ≥10 dated
instances — far past the bar. The rationale both rest on is
`docs/harness-engineering.md`.

Evidence for `herdr-conventions` (collected 2026-10-12): worktree-per-unit is already
the practice here, and the instances are dated rather than assumed. `herdr worktree
list --cwd ~/.omp` reports three linked worktrees today — solo-189 on
`migration/solo-211-untrack-uptime-log`, solo-201 on `bugfix/solo-201-sync-conflict`,
solo-213 on `continuous-improvement/solo-213-herdr-conventions` — and
`~/.omp/.git/worktrees/` holds exactly those three, with no prunable remnant. The
guard's own record supplies three more — a worktree run and two attempted worktree
commits blocked by the gap below:
DEFECTS 2026-09-28 (four of five guard suites found importing the hook by hardcoded
absolute path, so a worktree run tested the wrong copy), 2026-10-03 (a commit with the
bash tool's `cwd` set to a worktree on `docs/agents-loc-principle` refused as
`no-commit-on-main`), and 2026-10-06 (instance 2 of that same refusal). Six dated
instances in one repo clear the single-repo bar of five, and do not go far past it. The
seam itself was measured three times on 2026-10-12: `git worktree add -b` off `main` is
not blocked; a session rooted in a worktree commits and pushes its branch normally; and
`omp -p --no-session --cwd <worktree>` launched from the main checkout commits
normally, while the same commit with only the bash tool's `cwd` parameter set is
refused `no-commit-on-main` — the third measurement of the gap whose first two rows
`docs/guards.md` records, and still unactioned there. Two throwaway probes were used to
measure the guard the same day and then removed, leaving no trace in the worktree list
or in `.git/worktrees/`, so they are **not** counted above. What is **not** evidenced:
the *parallel* composition this standard is written for — several main sessions each
driving its own worktree at once — has not been practised at volume. The seam matters
because it is where that work will land, not because it has.

**Data engineering** — the processes we have provably been repeating
(`de-source-onboarding`, `de-backfill`, `de-schema-migration`, …). Three are
standardised as playbooks — `pb-data-source-onboarding`,
`pb-data-quality-incident`, `pb-data-schema-migration`; the other six are **not
yet standardised** in this form. Their evidence is recorded below under *Deferred*;
one at a time they are written up through `imp-standardize`.

Reference for the data domain: the maturity ladder lives in `docs/maturity/` —
`data-platform.md` (the six-stage table, cited line-by-line), transcribed from
the field guide copy `data-platform-evolution.html`; `ingestion-standards`
indexes into it and `pb-maturity-assessment` reads it for the data domain.

## How standard work is written

Enforced by `imp-standardize`. The constraints are measured, not stylistic —
reliable instruction-following breaks past five or six simultaneous constraints,
and excessive verification is the single largest recorded cause of regression:

- **≤5 steps**, each producing a named artifact.
- **One verification step**, and a **named exit condition**.
- **Rules referenced by URL** (`rule://`, `skill://`), never restated.
- **Dated instances cited** — do not standardise what you have not done.
- **Evidence bar**: ≥2 repos with ≥3 instances, or ≥5 in one repo. Below it, this
  is a task, not a standard.

The procedure is always a skill. The enforcement around it — a rule, a hook, a
script, a doc, a TTSR rule — is optional and earns its place only by doing
something the skill cannot. `imp-standardize` carries the artifact table and the
two binding rules: **prefer informing over blocking**, and **every check ships
with a case proving it can go red**.

`imp-standardize` is the **single verb** for standardising work. There is no
second entry point.

## Where rows land

Owned by the operations themselves — `imp-defect` → `DEFECTS.md`,
`imp-feedback` → `FEEDBACK.md`, `imp-change` → `IMPROVEMENTS.md`, `imp-verify` → `VERIFY.md`.
**One ledger per scope**: the global harness (`~/.omp/agent/`) or a project
(`<repo>/`), never per agent. Ledgers are append-only; one row per instance; a
workflow attributes its rows rather than carrying its own copy.

Formats: each ledger's operation — `imp-defect`, `imp-feedback`, `imp-change`, `imp-verify`.
Establishing a scope: `skill://imp-setup`.

---

## The stamped workflow agents

**The factory that produced these was retired on 2026-09-28.** Nothing new is
stamped — `imp-standardize` is the single verb for standardising work, and its
evidence bar (≥2 repos with ≥3 instances, or ≥5 in one repo) is where that rule now
lives. The stamping machinery is **deleted, not deferred**: the factory agent, its
templates and the `workflow-contract` skill are gone.

What remains is the nine `de-*` agents stamped in
`~/repos/the data-platform repo/.omp/agents/`. Each is **two files** (definition
plus changelog), with its procedure written as numbered steps in the definition
body. The file contract is `docs/workflow-agent-contract.md`.

`core-artifact-audit` — the factory's only stamp in the harness root — was retired
on 2026-09-28. Its disciplines had already moved into `imp-verify`, principle 4
(Genchi Genbutsu) and the delegation policy; the last one to move, re-testing a
surprising check before recording it, went to `imp-verify`. Its migration map is
`agents/core-artifact-audit/RETIRED.md`.

Where an agent body holds a real, hard-won guardrail, that guardrail is migrated
into standard work through `imp-standardize` — the graph is dropped, the learning
is kept.

**Do not create new stamps.**

### No graphs

The `workflow.yaml` graphs were removed on 2026-09-28. Every agent body already
carried its graph **node-for-node** as a numbered `## Procedure` — verified before
deleting, nine of nine with no gap — so the graph was a second copy of the
procedure, and the copy that would drift. The validator went with them: with no
graphs there is nothing to validate.

The **stop vocabulary** — `done` / `blocked` / `escalated` / `aborted` — is the
contract for the agents' `status` field and lives in
`docs/workflow-agent-contract.md`.

### Thinking level and rework

Workflow agents run with `thinkingLevel: off`. If a workflow agent repeatedly
produces rework at a specific node because it lacked deliberation, record it in
that agent's `IMPROVEMENTS.md` and consider raising its `thinking-level`,
documenting the decision in the same entry.

### Deferred activation

`audits/deferred-workflow-activation.md` records the three deferred options for
injecting the workflow reminder automatically (extension `context` event, TTSR
rule, slash-command orchestration graphs).

### Stamped agents

Project scope: the nine `de-*` agents live in
`~/repos/the data-platform repo/.omp/agents/` (proving ground; project
discovery wins by name).

| agent | trigger | evidence |
|---|---|---|
| `de-pipeline-change` | Change/fix one pipeline step, job, or asset against the data contract; write-first increments; verified against real data. | W3: ×3 repos; ~60 the data platform commits; ~30 in 46h in the data-platform repo. |
| `de-doc-knowledge` | Capture one durable lesson/runbook/trap into the document that already owns that concern, with resolving references. | W13: ×6 repos; ~20 the data platform; WATCHDOG dated sections; `20cba3c6` runbook. |
| `de-source-onboarding` | Add one new data source end-to-end on an existing contract, smoke-proven on one real item, with a dropout guardrail. | W1: ×4 repos; v2 nine boards + worked guide. |
| `de-quality-incident` | Handle one data-quality incident: landed-nothing guard, root cause before fix, one incident per dispatch, fix verified on real data. | W5: ×3 repos; the data platform ISSUES #45–#48 (2026-09-20); 12 dated lessons in v2. |
| `de-transform-build` | Build one transform/asset against real input data; subset materialization; output contracts verified with a proven red case. | W2: ×3 repos; v2 silver+gold assets; the data platform transform commits. |
| `de-schema-migration` | Change one schema via a migration that ships with its code; Alembic owns DDL; additive-only; verified on a copy. | W4: ×2 repos; 3 instances in 2 days in v2; 5 in the data platform; ADR-0010. |
| `de-backfill` | Backfill one bounded historical slice; proven resumability; background run; verified against the stated bound. | W12: ×2 repos; 6 the data platform; `f13f0d86` resumable backfill (2026-09-20). |
| `de-decommission` | Retire one source/table/pipeline: side-effect inventory, explicit exclusion record, code removed, data preserved. | W11: ×2 repos; 4 the data platform; v1 EXCLUDED_SOURCES; v2 recorded deletions. |
| `de-orchestration` | Schedule/automate one data run; prove the automation fires (real RunRequest) and lands its materializations; record for on-call. | W71: ×3 repos; 4 the data platform; `2811faca` ship daily_medallion RUNNING; v2 six modules. |

### Backlog — candidate standards, not yet written

| workflow | status | evidence / gap |
|---|---|---|
| Root orchestration graphs (`workflows/<mode>-orchestration.yaml`) | planned | deferred; validator naming rule already shipped. |
| `core-kaizen` | **superseded** | by `imp-kaizen` — the skill exists; the agent stamp is not needed. |
| `core-kaizen-dev-experience` (W78) | backlog | ×4 repos, structural evidence only — needs dated instances. |
| W14 release, W55 CI/CD, W6 breaking contract change, W7 environment provisioning, W8 performance, W65 decision documentation, W72 shared library, W31 root-cause analysis | backlog | evidence exists but below the bar or subsumed (W31 by W5). |
| `de-wip-cleanup` candidate | backlog | post-landing cleanup sweeps are real and repeated, but no per-instance dated inventory was collected — collect instances first. |
| `de-contract-upgrade` candidate | backlog | contract-change work is real (W6-shaped) but did not meet the ≥2-repo/≥3-instance bar; collect dated instances first. |
| W9, W59, W60 | backlog | zero evidence anywhere in the window — do not build. |

---

## Known trap — the data platform id collision

`~/repos/the data platform` docs use internal ids that resemble `W9`/`W10`/`W2` — they
are **not** catalog ids here. Never grep `\bW\d+\b` in the data platform for workflow
evidence.
