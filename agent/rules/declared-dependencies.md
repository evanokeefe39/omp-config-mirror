---
description: Declare data-flow dependencies and ordering explicitly. A producer must declare what it depends on and what it feeds — ordering and freshness are declared relationships, never side effects of run order.
alwaysApply: true
agents: ["data-*"]

---

# declared-dependencies

A data flow's ordering and freshness must be explicit, not emergent.

- Every asset/producer declares its dependencies (upstream inputs) and its
  consumers (downstream outputs). Silver must never run before bronze because
  ordering was an accident of run order — it is a declared dependency.
- Freshness/staleness expectations are declared per source, per asset.
- Surface a missing or cyclic dependency rather than relying on incidental
  sequencing.
