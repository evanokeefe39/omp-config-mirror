---
description: A schema/DDL/state change ships with its migration, never as a bare edit. State travels with code — additive-only migrations, no destructive DDL against real data. A change that alters schema or state without its migration is incomplete.
alwaysApply: true
agents: ["data-*", "app-backend-*", "iac-*"]

---

# migration-ships-with-code

Enforcement is the **`migration-guard` hook** (`hooks/pre/migration-guard.ts`),
which blocks destructive DDL on a migration path at the tool call. It collects
every string in the call, so it does not depend on which argument key a tool uses.

This rule previously also carried a TTSR `condition` covering the same pattern,
so it nudged alongside a hook that already blocks. `AGENTS.md`: never use a TTSR
rule where a hook will do.

**Do not add a condition here.** If enforcement needs to change, change the hook.

A change to schema, DDL, or persisted state is not just a code edit — it ships
with the migration that applies it, so the state change is reproducible and
reviewable, never a one-off hand edit.

- Prefer additive-only migrations (ALTER, additive columns/tables); never DROP
  against real data in a numbered migration.
- Read every pending migration before applying; never run one you have not
  reviewed (a `DROP TABLE` in a migration destroys real data).
- A schema/state change with no migration is an incomplete change — surface it.
