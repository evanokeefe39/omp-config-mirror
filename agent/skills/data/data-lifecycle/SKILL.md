---
name: data-lifecycle
description: >
  The operating premise and rules for data work — statefulness, the
  source-consumption taxonomy, and the twelve data-plane rules by name. Loaded
  automatically by every de-* workflow agent (autoloadSkills). Read by the root
  when dispatching or reviewing data work.
---

# data-lifecycle — the statefulness premise

**Changing a derivation, schema, or pipeline does NOT self-correct existing
data.** Historical rows computed under the old logic stay stale until actively
refreshed. The first question on any data change: *what does this invalidate,
and how do I refresh it?* Answer it before implementing.

## Source-consumption taxonomy

Every table, view, derived column, cache, or consumer touched by a change is
one of:

- **stored-derived** — materialized from other data; goes stale; needs a
  refresh plan (full refresh, versioned backfill, or self-versioning marker).
- **recomputable view** — derived at read time; self-corrects; verify only.
- **source/raw** — as-observed landing; immutable; leave untouched.

State the classification for each affected object, explicitly, before writing
code.

## The twelve data-plane rules

ByName — the rule bodies live in the global ruleset and bind every data
change:

`contract-first-traceability` · `idempotent-replay` ·
`wap-audit-before-publish` · `provenance-on-derived` ·
`declared-dependencies` · `dormant-vs-broken` · `new-source-rule` ·
`metrics-derived-upstream` · `qa-codified-every-layer` ·
`validate-against-real-dev-run` · `migration-ships-with-code` ·
`change-review-blast-radius`
