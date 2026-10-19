---
description: Before any change to a contract, module, or schema, enumerate the blast radius — every consumer, caller, and downstream artifact — and re-validate each. A change that silently breaks a downstream consumer is a defect regardless of its own tests passing.
---

# change-review-blast-radius

Every change has a blast radius: the set of things that read or depend on what
you are changing. Enumerate it before you implement.

- Identify every consumer: tables/views/derived columns, callers/imports,
  dashboards and frontends, caches, checks.
- For each, classify: does it store derived data (needs refresh), is it a
  recomputable view (self-corrects), or is it a source/raw table (leave)?
- State the refresh/impact plan explicitly (full refresh, versioned backfill,
  or a self-versioning marker) and re-validate each consumer after the change.
- Signal downstream consumers whose data contract changed — including
  dashboards/frontends, not just code callers.
