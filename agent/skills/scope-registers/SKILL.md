---
name: scope-registers
description: "Find the owning scope's VERIFY.md (checks) and FEEDBACK.md (sensors) at runtime and use the rows that cover the files you touch. Every engineer and reviewer runs it before work."
---

# scope-registers

A subagent never receives `AGENTS.md`, so the scope's checks and sensors have to be
found, not assumed. This skill finds them at runtime, so no agent definition ever
hardcodes a path that drifts.

The registers are plain tables. `VERIFY.md` holds the checks, one row per check;
`FEEDBACK.md` holds the sensors, one row per signal. A row's `command` is runnable,
and `goes red` names the input or edit that makes the check fail.

## 1. Locate

Walk up from each file you will touch to the nearest ancestor that has a
`VERIFY.md`; that ancestor is the scope. For paths under `~/.omp/agent/`, the
global scope `~/.omp/agent/` also applies, because harness work is observed at the
harness scope as well as the project.

If no ancestor has a register, record `no register` in `not_verified` (engineer) or
`register_gaps` (reviewer) and continue. Missing registers are a finding, not a
reason to stop.

## 2. Select

- From `VERIFY.md`, take the rows whose `command` or `check` names a file you
  touched or its containing directory. The columns are
  `scope | stage | check | command | proves | doesn't prove | goes red | concurrency safe | expected runtime`.
- From `FEEDBACK.md`, take the sensors that observe the artifact you touched. The
  columns are `signal | where it lands | why / when it's useful | cadence`.

## 3. Use

- **Engineer** — before returning, run each selected `command` whose
  `concurrency safe` says yes, and report every one in `checks_run` with its
  result. A selected command you did not run is a `not_verified` entry.
- **Reviewer** — rerun the same commands independently rather than trusting the
  engineer's report, and read each selected sensor's output once. A self-report is
  not evidence.

## 4. Gaps

An artifact you touched that no VERIFY row covers is a `register_gap`. Propose the
row in `skill://imp-verify` format (nine columns, with a real `goes red`) inside
`proposed_register_rows`, and report it in `register_gaps`.

Never write a ledger yourself. The root appends rows through the `imp-*`
operations that own each format.
