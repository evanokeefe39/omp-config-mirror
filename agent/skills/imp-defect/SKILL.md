---
name: imp-defect
description: >
  Record a defect in the append-only DEFECTS ledger — one row per instance, at
  the scope that owns it. Use when something broke, a guard failed to fire, or a
  near-miss happened. Root cause is not required to file a row.
---

# imp-defect — record a defect, one row per instance

A defect that is not recorded is a defect that recurs. The obligation underneath
is Toyota's **jidoka**: stop at the abnormality rather than passing it downstream,
and light the andon so it cannot be forgotten. The ledger is the andon board.

## Run it when

- something produced a wrong result and nothing caught it
- a guard, check or test failed to fire — or fired and was ignored
- a near-miss: it did not land, but it was one step away
- you are fixing something and want its frequency on the record

## You need first

**The owning scope.** A defect belongs to the scope whose capability it
undermines — not to the agent that found it:

| the defect | the ledger |
|---|---|
| happened **in** a repo | `<repo>/DEFECTS.md` |
| is a harness / factory defect | `~/.omp/agent/DEFECTS.md` |
| is a workflow's own process failing | the owning scope's ledger, `observed_by: agents/<name>` |

## Steps

1. **Stop and check whether it is already recorded.** A repeat is a **new row** —
   the instance count is the signal, so never merge instances and never reopen a
   row.
2. **Append one row, eight columns exactly** —
   `observed_at | repo | component | branch | observed_by | context | evidence | repro`.
   - `component` is the specific thing (file, script, table, doc) — the repo has its own column.
   - `evidence` is a **path or a command**, never a description of where to look.
   - `repro` is steps, or `n/a`. Root cause is not required.
3. **Never edit a landed row.** A correction is a new row whose `context` names
   the row it supersedes.
4. **If you are also fixing it, that is a change** — record it through
   `imp-change`. This ledger records what broke; `IMPROVEMENTS.md` records what changed.

## Done when

The row sits at eight columns and its `evidence` cell resolves — a real path, or a
command that runs. A row whose evidence cell cannot be checked is a description,
and this ledger does not carry descriptions.

## Where it lands

`DEFECTS.md` at the owning scope. **This skill owns the row format** — the eight
columns above are the definition. `skill://imp-setup` owns which scope gets
which ledger, and how to migrate a superseded document into one.
