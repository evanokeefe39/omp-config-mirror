# A change that deletes must re-read the registers

A register — `VERIFY.md`, `FEEDBACK.md` — is a claim about what the code does. When
code is deleted, the rows that named it become **false**, and a false row is worse
than a missing one: it certifies a check nobody runs. This rule makes the deletion
sweep include the claims made about the deleted code.

## The rule

**Before a change that removes a symbol, a surface, an event, a config key or a
whole module is declared done, grep the registers for every name being deleted, and
resolve each hit.**

Resolution is one of three:

- **Repoint** — the behaviour survives under a new name or suite; update the row to
  the successor and re-run it.
- **Retire** — the behaviour is gone; delete the row. The register is not a history:
  a retired check belongs in the commit message, not in a row that reads as live.
- **Narrow** — the check survives but proves less than the row claims; rewrite the
  `proves` cell to what it actually establishes.

A row whose `goes red` cell admits no red was ever observed is not exempt: either
produce the red case, or say `UNPROVEN` in the row. A green-only check proves the
happy path parses, not that the check would reject anything.

## Why it is a rule and not a habit

Measured on an extension repo, 2026-10-04. A rewrite that changed
**+615/−478 lines** of `index.ts`, `src/` and `rules/` changed `VERIFY.md` by
**2 lines** and `FEEDBACK.md`, the improvement ledger (`IMPROVEMENTS.md`, then named `CHANGELOG.md`), `DEFECTS.md` by **zero**. An audit
found **26 of 47 register rows dead** — naming `statusText`, `decisions.jsonl`,
`phasesOf`, `mergePhases`, `deriveState`, `check.py` levels 1 and 7, `R0`/`R2`/`R3`,
`strategy`, `todoStale`, `routeDue`, `judgeName`. Ten further rows were
never-proven.

The pattern is not one project's slip. It is structural: the `imp-*` operations are
invoked **per defect**, so a fix commit touches a ledger (0.5.2, a one-line fix,
did), while a **rewrite** has no owning operation and touches none. The registers
are read at fix time and never re-read at release time, so a deletion verified by
`grep` at the fix is never verified against the claims that referenced it.

The cost is concrete: one dead row was the sensor for the *next* defect — a status
paint check that would have caught the surface being deleted, retired silently, so
the deletion went unnoticed until a later audit.

## What this costs

One grep per deletion set, and the time to resolve the hits — minutes on a normal
change, an hour on a rewrite. Against a register that lies, it is cheap.

## Where it binds

- A **deletion sweep** — a change whose diff is mostly `-` lines, or that removes an
  exported symbol, an event name, a tool, a config key or a file.
- A **surface swap** — a paint moving from a protocol frame to a widget, a log file
  to a session record, a CLI flag to a config key. The old surface's rows die with it.
- **`decommission`**, the lifecycle stage that exists for exactly this.

Pair with `skills/imp-verify` (the row format and how to prove a red case) and
`skills/imp-change` (the observation-cycle row). This rule says *when* the registers
must be re-read; those operations say what to write.
