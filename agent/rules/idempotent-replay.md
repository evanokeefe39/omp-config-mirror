---
description: Re-runs must be safe. Any pipeline, backfill, migration, or load must be idempotent — running it twice never corrupts or duplicates state. Use natural-key upserts, additive-only DDL, and deterministic ordering.
alwaysApply: true
agents: ["data-*", "app-backend-*", "iac-*"]

---

# idempotent-replay

A run that is re-executed (retry, backfill, resume after crash) must produce
the same correct state — never duplicate, corrupt, or drop.

- Loads and backfills are idempotent by natural key (`INSERT ... OR REPLACE`,
  `ON CONFLICT`, additive-only DDL) so re-runs never corrupt state.
- Deterministic ordering: a re-run after a partial/crash must not double-count
  or leave a gap.
- Verify idempotency by running twice and confirming identical, correct output.
