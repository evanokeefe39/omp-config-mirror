# Harness engineering — the cycle for extending a coding agent harness

Why this doc exists: the processes for building a web app or a data platform do not
transfer cleanly to harness work, and improvising the difference is how a harness
gets broken. The procedure is `skill://harness-engineering`; the routable playbooks are
`skill://pb-feature` and `skill://pb-bugfix`, routed through `skill://pb-design`. This is the rationale both rest on — what makes the domain
different, what each stage produces, and the failure modes that have actually
happened, each dated.

## Why it is not an app or a data-platform build

- **The artifact is the tool.** A broken web app is a broken page; a broken harness
  costs the ability to fix it, in every session at once. Cost of a bad change far
  exceeds cost of a slow one, so recoverability and native-first research come
  before code.
- **Nothing compiles the content.** Skill bodies, rules, prompts and agent
  definitions are text: no compiler catches a rename, a dropped frontmatter field,
  or a `skill://` reference to a skill that does not exist. The blast radius is
  whatever greps.
- **Facts are version-pinned.** The harness API drifts between installed versions,
  so a design built on a fact from another version is a defect waiting to happen.
  Measured 2026-09-29: `omp --version` read 18.2.1 in one probe and 18.4.3 in
  three later readings on the same machine — recorded in
  `example-ext/DEFECTS.md`, which is why a probe re-answers every
  source-derived fact (spec edge case E11).
- **The platform is already rich.** Recreating a native mechanism shadows it, and
  the shadow drifts from the platform forever. Measured twice: the first
  playbook-router implementation (a maintained registry, an injected menu, a
  session toggle) was retired in favour of an observe-only extension riding native
  events; and the shipped router initially dropped omp's own
  `metadata.router-playbook` classification by requiring a `pb-` prefix.
- **Live sessions cache.** A session loads hooks, rules and extensions at start, so
  editing a hook does not take effect in a running session, and the session that
  made a change cannot observe it. Verification has to be a fresh process.

## The cycle

The harness's lifecycle line — research → design → develop → test → PR + review →
CI → monitor → enhance / refactor / decommission — maps onto harness work like
this. Each stage names what it reads, what it produces, and one instance.

| stage | reads | produces | instance |
|---|---|---|---|
| research | installed docs, types, source; a probe of the running version | a facts note that answers every source-derived fact and names the native mechanisms found | `research-scope/findings/omp-api-probe-answers-2026-09-28.md`; the 18.2.1/18.4.3 drift row |
| design | the approved spec from `pb-spec` and the facts note | design.md (how: 2–3 competing sketches compared whole-shape, per `skill://pb-design`) plus a plan (order) — design reads a spec, it does not write one | `example-ext/specs/SPEC.md` BC12–BC30; the plan's WP0 "spec vs machine" defect row |
| develop | the spec | the change, one artifact at a time, on a branch — pure core with thin handlers, fail-open, conventional commits; dispatched to `harness-engineer`, which autoloads this cycle's skills and binds its own constraints | the `~/.omp` PRs #2–#12 (three days) |
| test | the change | a deliberate red case per new check, differential captures (enabled vs disabled, before vs after), fresh-process output, the rendered surface where the report is about rendering | BC12/BC13 byte-identity probes; guard matcher red cases; PTY frames read for the display fix |
| PR + review | the diff | a fresh-context review that reads the diff, not the summary; squash-merge | the three-reviewer panel that returned unanimous retry on the router (E18) |
| monitor | ledgers and sensors | a regression caught by a red check; an improvement captured as a ledger row and then a standard | router decisions log; `SYNC-STALLED` marker; intervention-rate query |
| decommission | the off-switch contract | removal proven by byte-identity: with the change off, the provider request equals a session where it never existed | BC13 (78 116 bytes, sha256 `38de7642…3f556`) |

## The five mechanisms that carry the trust

1. **Native-first, then ecosystem-first.** Read what the platform already provides
   before designing — a recreated mechanism is a shadow that drifts — then check
   what the ecosystem already ships (`omp skill search`, marketplaces, GitHub) and
   adopt before building. `skill://omp-conventions` is the harness-side map; the
   platform's authority is its version-pinned docs at `omp://`.
2. **Blast-radius enumeration.** Grep the name of the artifact across the harness
   and every affected project; nothing compiles the references.
3. **Recoverable before-state.** HEAD, `git status --short`, the restore command,
   and a live backup channel, *before* the first edit. New artifacts belong in one
   of the sync's two lists — data in `ALLOW`, behaviour-defining code in `CODE`; a
   path in neither stays untracked, the intended signal, and silently unbacked.
4. **Fresh-process proof with a red case.** The session that made the change cannot
   see it; every check ships with a case proving it can fail.
5. **Land through the ledgers.** `skill://imp-change` (the change and what it
   taught), `skill://imp-verify` (the check and its red case), `skill://imp-defect`
   (what broke), and a named sensor for the regression you would want to hear about.

## Cross-harness

The shape ports across coding harnesses even though the names differ:

| harness | home root |
|---|---|
| omp / pi | `~/.omp/agent/` |
| Claude Code | `~/.claude/` |
| Codex | `~/.codex/` |
| Hermes | `~/.hermes/` |

Every one of them keeps config artifacts (skills, rules, hooks, commands, settings)
under a home root, pins an API that drifts, and needs a versioned backup channel;
`research-scope/findings/vendor-harness-comparison.md` compares the surfaces.

Two facts about omp are load-bearing for this cycle, both measured 2026-09-30:

- **omp ships no built-in skills.** Its built-in knowledge is the documentation —
  https://omp.sh/docs, source tree https://github.com/can1357/oh-my-pi/tree/main/docs
  (`skills.md`, `extensions.md`, `hooks.md`, `settings.md`, `config-usage.md`,
  `marketplace.md`, authoring guides under `docs/skills/`) — plus the bundled
  agents (`omp agents unpack`, `~/.omp/agent/agents/`), bundled commands
  (`ci-green`, `review`) and CLI surfaces (`omp --help`, `omp skill`, `omp plugin`,
  `omp agents`). A session's skill roster is the scopes' own skills.
- **Prior art is cheap; custom machinery is not.** Check the Skillshare registry
  (`omp skill search <term>`, skills.omp.sh), plugin marketplaces and GitHub before
  building a skill, plugin or extension — an adopted tool costs configuration, a
  custom one owes maintenance and monitoring forever.

The commands in this standard are omp's; the cycle is not.

## Dated instances (the standard's evidence)

| window | instance | where |
|---|---|---|
| 2026-09-27 → 29 | ~10 PR'd harness changes: factory→standard work, `new-project`, two guard-matcher fixes each with an observed red case, the router's visibility and display fixes | `~/.omp` PRs #2–#12 |
| 2026-09-29 | extension from spec to installed: 68 tests, BC12/BC13 differential probes, a status-paint defect caught by reading raw frames rather than the summary | `~/repos/example-ext` |
| 2026-09-29 | live trial in a real scope; user-reported display defects verified against PTY frames; config-deletion near-miss from an unmerged branch | `~/repos/research-scope` |
| 2026-09-27 → 28 | nine `de-*` agent definitions plus changelogs — harness content maintained inside a project scope | `~/repos/the data-platform repo/.omp/agents/` |
| 2026-09-21 → 29 | incident files and the seven-day defect and autonomy review, from which several rules were drawn | `~/repos/research-scope/findings/`, `incidents/` |

Four repos, well past the `imp-standardize` bar (≥2 repos with ≥3 instances).

## Known traps (measured on this machine, 2026-09-29)

- **Bare `bash` is broken in some Windows shells.** It resolves to the WSL launcher
  (`C:\WINDOWS\system32\bash.exe`) and dies with `CreateProcessCommon … execvpe(/bin/bash)
  failed`. Run harness scripts as `"C:/Program Files/Git/bin/bash.exe" <script>` or
  through the `.cmd` wrapper (`omp-git-sync.cmd`), which already names git bash by
  absolute path.
- **Two skill roots, one served.** `~/.omp/agent/skills` is authoritative and
  versioned — `skills.customDirectories` in `config.yml` is the one line that makes
  it served, and `scripts/skill-root-check.py` guards that line. `~/.agents/skills`
  is a vendor root (currently empty); `~/.omp/skills` held 17 stale entries and was
  deleted on 2026-10-12 (SOLO-206), so `agent/skills` is the only root left.
- **The `~/.omp` channel is the in-place repo itself**, pushed to `omp-home` by a PR —
  there is no separate backup repo and no machine author.
  `agent/scripts/omp-git-sync.sh` fetches, fast-forwards `main` when that is safe, and
  reports; it commits nothing, so an artifact is unbacked until whoever wrote it
  commits it, and `status` names what is uncommitted.
- **A dirty harness tree is normal.** At the time of writing, 18 paths were
  modified/untracked ahead of the last commit; commit only the paths a change owns,
  never `git add -A` — nothing else will commit them, which is the point.
