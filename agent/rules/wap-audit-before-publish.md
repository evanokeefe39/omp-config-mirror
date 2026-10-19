---
description: Write-Audit-Publish before consumers can read new data. Land new/derived rows where consumers don't read, audit against the quality contract, then atomically publish. Never let a consumer see partially-audited data.
alwaysApply: true
agents: ["data-*"]

---

# wap-audit-before-publish

Make writes atomic from a consumer's point of view: Write, Audit, Publish.

- **Write** to a staging location consumers do not read.
- **Audit** against the quality contract (counts, freshness, schema, invariants).
- **Publish** only what passes — atomically (rename/swap), so no consumer ever
  reads a partial or unaudited slice.
- Guard derived data so stale state under old logic is detectable (self-version
  the derivation), not silently served.
