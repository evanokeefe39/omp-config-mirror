---
name: harness-engineering
description: "Extend a coding harness safely: native-first research, fresh-process proof, recoverable land."
---

# harness-engineering — the cycle that keeps the harness recoverable

Harness work is unlike application work in one decisive way: **the artifact is the
tool you are using.** A broken web app is a broken page; a broken harness costs the
ability to fix it, in every session at once. That asymmetry is why recoverability
and native-first research come before code — and why verification has to be a fresh
process, not the session that made the change.

## Run it when

A change touches a coding agent harness — `~/.omp/agent/`, a project's `.omp/`, or
a repo a harness ships from. Harness work routes through `pb-spec` /
`pb-design` / `pb-feature` / `pb-bugfix` — with harness-engineer as the builder
and this skill as its standard. Run it directly
for a change too small to need the playbook's todo.

## You need first

- The artifact being changed, read in this session — a summary of it is not it
- The platform's own knowledge, loaded before designing: the version-pinned
  `omp://` docs for the artifact class, via the `skill://omp-conventions` index —
  plus a probe of the *running* version for every source-derived fact. omp ships
  no built-in skills; its docs are embedded at `omp://` for the running version,
  and facts are version-pinned
- Prior art, checked before building: `omp skill search` (skills.omp.sh), the
  plugin marketplace, and a web search for an existing skill, plugin or extension
  that already does this. Adopt before building — custom machinery owes maintenance
  and monitoring forever
- `skill://omp-conventions` for where the harness keeps each artifact type, and
  `skill://git-conventions` for how the change lands
- A recorded before-state: HEAD, `git status --short`, and the exact restore command

## Steps

Each step produces a named artifact. A step with nothing to show for it did not happen.

1. **Research the native surface first — and the ecosystem around it.** Load the
   platform's own docs for the artifact class before designing anything, then ask
   what already exists: every harness ships skills, rules, hooks, commands,
   settings, events and listing mechanisms, and recreating one shadows it — the
   most expensive mistake in this domain, because the shadow drifts from the
   platform forever. Check prior art too — `omp skill search`, the plugin
   marketplace, GitHub, a web search — and adopt before building: custom machinery
   owes maintenance and monitoring an existing tool does not, and ask whether a tool
   or repo already does what the user wants — including very new, unpopular repos —
   and when one fits, stop for a build-or-adopt decision. Probe the running
   version, and have a `scout` map the artifacts that already reference what you
   are about to change, since nothing here compiles and the references are the
   blast radius.
   → *a facts note: docs read, version probed, native mechanisms and prior art found, what is genuinely new*

2. **Design against those facts, and name the negative space.** The contract holds
   what changes, what must not, and the edge cases — in the spec when a spec owns
   the behaviour, as a spec edit before implementation. One artifact per edit, and
   the artifact re-read immediately before it.
   → *the contract and the list of artifacts that reference the one changing*

3. **Take the before-state, then change one thing at a time.** Record HEAD, the
   dirty tree and the restore command *before* the first edit, and confirm the
   backup channel is alive — for `~/.omp` the sync script
   (`agent/scripts/omp-git-sync.sh status`); name the channel for any other scope.
   A backup taken after the change is not a backup. Anything the agent calls must
   fail open: never block, slow or alter a tool call.
   → *a recorded before-state, then the change — alone*

4. **Prove it in a fresh process, and make the check go red.** Sessions load rules,
   hooks and extensions at start, so the session that made the change cannot see
   it: verify from a *new* process and keep the captured output. Make it
   differential where possible — enabled vs disabled, before vs after — and
   exercise every new check red once, on purpose.
   → *captured fresh-process output, with one deliberate red*

5. **Land it recoverable, indexed and sensed.** Fresh-context review of the diff
   against the ask, reading the diff rather than the summary. Confirm a new
   artifact is in the right sync list: data in `ALLOW`, behaviour-defining code in
   `CODE` — which the sync never stages, so it lands by PR. Index new or changed standard work in
   `WORKFLOWS.md`. Append the ledger rows — `skill://imp-change` for the change,
   `skill://imp-verify` for a new check with its red case, `skill://imp-defect` for
   what broke on the way. Run the sync; a non-zero exit is the result. Name the
   sensor that would catch a regression, or say plainly that none exists.
   → *a squash-merged PR, the ledger rows, and the named sensors*

## Done when

- A fresh process shows the new behaviour, with its output kept
- The previous behaviour is one command away, and the before-state is recorded
- `omp plugin doctor` reports 0 errors
- Nothing still references the old state, and a new artifact is in the right sync list (`ALLOW` for data, `CODE` for code)
- The ledger rows exist, and the sync reports success or its exit code is reported

## Where it lands

The artifact itself; `WORKFLOWS.md` when a standard was added or changed; the four
ledgers at the scope that owns the concern; and the backup/sync channel. Siblings:
`skill://omp-conventions` for the artifact taxonomy, and `skill://imp-change`,
`skill://imp-verify` and `skill://imp-defect` for the rows.

## Harness standards

- **Research four angles before designing** (blast radius, vendor conventions,
  current practice, blindspots), then decide build or adopt:
  - Blast radius: map every artifact of the affected class, the bundled agents
    (`omp://task-agent-discovery.md`), installed plugins (`omp plugin list`), and
    every reference to the artifact being changed — nothing compiles skill bodies.
  - Vendor conventions: read the version-pinned `omp://` docs for the artifact
    class via `skill://omp-conventions`, and quote the doc path for each rule.
  - Current practice: web-search how other agent harnesses solve it (after: the
    last 12 months), plus any vendor changelog entry that changes the answer.
  - Blindspot search: does something already do this? GitHub (including repos
    from the last 30 days), `omp skill search`, plugin marketplaces, and the
    wider tool ecosystem. Return each candidate with URL, fit, maturity, date.
  - If a candidate fits the ask, stop and ask the user: adopt, adapt, or build —
    do not design or build past that point until the user answers; with no
    candidate, record "none found" and the searches run.
- **Record the before-state and confirm the backup channel before the first
  edit**: `git rev-parse HEAD`, `git status --short`, the exact restore command,
  and `agent/scripts/omp-git-sync.sh status` (name the channel explicitly for
  any other scope). A backup taken afterwards is not a backup.
- **One artifact at a time**, re-reading it immediately before the edit.
- **Prefer the native mechanism over new code**; anything the agent calls must
  fail open and never block, slow or alter a tool call.
- **Prove it in a fresh process**: sessions load rules, hooks and extensions at
  start, so the session that made the change cannot see it — verify from a new
  process and keep its output. Make every new check go red once, on purpose.
- **A new artifact belongs in one of the sync's two lists.** Data goes in `ALLOW`,
  behaviour-defining code in `CODE`. A path in neither stays untracked — the intended
  signal, and silently unbacked; a path in `CODE` is never staged by the sync, so it
  is backed up only once its own PR lands.
- **Index and ledger**: record new or changed standard work in `WORKFLOWS.md`,
  and append the ledger rows (`skill://imp-change`, `skill://imp-verify`).
- **For an extension change, `omp plugin doctor` reports 0 errors.**
