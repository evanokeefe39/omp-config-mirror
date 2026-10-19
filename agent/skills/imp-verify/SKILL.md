---
name: imp-verify
description: >
  Record or maintain a check in the VERIFY register — nine columns, one row per
  check, and the load-bearing cell is `goes red`. Use when you add a guard, gate,
  test or check, when a check is re-homed or retired, or when asked what actually
  proves the system works.
---

# imp-verify — say what proves it, and what would prove it wrong

A check that cannot fail proves nothing. This operation keeps the `VERIFY.md`
register honest: which checks exist, what each proves, what it explicitly does
**not** prove, and the concrete edit that makes it go red.

The register's value is that it cannot flatter you. `proves` is the easy column —
`doesn't prove` and `goes red` are the ones that make a green result mean
something.

## Run it when

- you added a guard, gate, test or check — or a change you landed did
- someone asks **how do we know this works?** and no row answers
- a check is re-homed, renamed or retired
- an `imp-kaizen` pass found a claim nobody can falsify

## You need first

**The scope that owns the check**, and the lifecycle stages its register declares.
`stage` is read against that list, so name the stage in the scope's own
vocabulary — never a software stage on a media scope.

## Steps

1. **State what the check proves** — one outcome, not a mechanism. "No ledger has
   lost a row", not "runs an awk script".
2. **Write `goes red` before the green.** The concrete input or edit that makes it
   fail. If you cannot name one, the check is decoration — fix it or do not record
   it. **A check with no known failing case proves nothing.**
3. **Write `doesn't prove` honestly.** The boundary is the useful part; a green
   result that quietly claims more than it establishes is worse than no check,
   because it ends the search.
4. **Fill the nine columns** —
   `scope | stage | check | command | proves | doesn't prove | goes red | concurrency safe | expected runtime`.
   `command` must be runnable, not a description; `expected runtime` says what it
   scales with.
5. **Exercise it** — run it, then make it fail on purpose and watch it go red. A
   row describing a check nobody has seen fail is a claim, not a record.

## A surprising result is re-tested, not recorded

A check's result is an observation, not a finding. If one surprises you — fails
where you expected a pass, passes where you expected a failure — re-run it before
you believe it. **A single contradictory reading is a reason to re-test, not
something to record**, and a flake filed as a defect costs someone an afternoon
chasing a row that was never true.

## This is a register, not a history

`VERIFY.md` describes what exists **now**. A check that is re-homed, renamed or
retired has its row **replaced** — or removed, if the check is gone. Holding a
register append-only is exactly how a stale row survives, and a stale `command`
cell sends the next reader to a path that no longer exists.

Contrast `DEFECTS.md` and `IMPROVEMENTS.md`, which are **histories**: append-only,
one row per instance, a correction being a new row whose `context` names the old
one.

## Done when

One row per check, nine columns, a `goes red` a reader could actually perform —
and the check has been observed failing.

## Where it lands

`VERIFY.md` at the owning scope. The row format is owned **here**;
`skill://imp-setup` establishes a scope and `skill://imp-change` records the
change a check arrived with. Siblings: `imp-defect` (what broke), `imp-feedback`
(what senses).
