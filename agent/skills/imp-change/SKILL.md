---
name: imp-change
description: >
  Record what changed and why — the IMPROVEMENTS row and the commit. Use after
  implementing a fix, improvement or guard, or when asking why the system is the
  way it is.
---

# imp-change — record a change so it survives

Toyota's rule is uncompromising: **an improvement is not finished until the
standard is updated.** Otherwise the gain lives in one person's memory and the old
method returns the moment they are absent. Here the updated standard is the ledger
row plus the commit.

Two fixes are not the same thing, and saying which you made is the discipline:

- **Containment** — stops the bleeding. Patch, restart, move on. The problem recurs.
- **Countermeasure** — removes the cause, so it cannot recur.

## Run it when

- you implemented a fix, an improvement, or a new guard
- you changed a rule, skill, document, template or workflow
- you are asking **why is it like this?** and no row explains it
- an `imp-kaizen` pass proposed something and you are landing it

## You need first

**The owning scope** — global harness (`~/.omp/agent/IMPROVEMENTS.md`) or a project
(`<repo>/IMPROVEMENTS.md`). A workflow agent carries its own `IMPROVEMENTS.md`; the scope
ledgers belong to the harness or the project, never to an agent. `CHANGELOG.md` is
not this ledger: it means release notes, which release-please writes.

## Steps

1. **Append one row, nine columns exactly** —
   `date | scope | observed | learned | recommended | status | actioned | reason | details`.
   `observed` is what actually happened, `learned` is the root-cause insight rather
   than the symptom, and `actioned` **names the file changed and when**. A row that
   says "fixed" and names nothing is unverifiable.
   - `status` is exactly one of `implemented` (a change landed), `not actioned`
     (proposed, deferred, or nothing landed yet) or `rejected` (decided against).
   - `reason` is filled **iff** `status` is `rejected` — why it was decided against —
     and is `—` otherwise.
   - `details` links a long-form page under `docs/retrospectives/` when the row needs
     more than the compact cell carries; empty otherwise.
2. **Commit it.** The commit is where the change becomes the baseline, with a
   message saying what changed and why. Conventional commit, on a branch — never on
   `main`.
3. **If the change also added a check**, that half is `skill://imp-verify` — a
   `VERIFY.md` row, owned there, because a guard with no recorded red case is not yet
   a guard.
4. **Say whether it was containment or a countermeasure**, and if it was
   containment, what the countermeasure would be.

This is a **history**: append-only, one row per instance. A correction is a new row
that names the row it supersedes — never an edit to a landed row. `DEFECTS.md` is
the other history; `VERIFY.md` and `FEEDBACK.md` are **registers**, replaced in
place, and each says so itself.

## Done when

The row sits at its column count, `status` is one of the three values with `reason`
filled exactly when it is `rejected`, `actioned` names real files, and the commit
exists. `scripts/ledger-check.sh` checks both for the global ledger.

## Where it lands

`IMPROVEMENTS.md` at the owning scope — or `agents/<name>/IMPROVEMENTS.md` for a single
agent. The row format is owned **here**; `skill://imp-setup` owns scope and
migration. Sibling operations: `imp-defect` (what broke), `imp-feedback` (what
senses), `imp-verify` (what proves it), `imp-kaizen` (what to improve next).
