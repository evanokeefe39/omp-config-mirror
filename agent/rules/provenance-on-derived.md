---
description: Every derived artifact carries provenance — its source inputs, the derivation logic, and when it was produced. A derived value with no traceable origin is untrustworthy. Medallion layers keep raw as-observed and derive with provenance.
alwaysApply: true
agents: ["data-*"]

---

# provenance-on-derived

A derived value is only as trustworthy as its origin. Every derived artifact
must be able to answer: what produced this, from what, using which logic, when?

- Derived layers (silver/gold) record provenance — source inputs, derivation
  version, materialization time.
- Raw/bronze stays as-observed; never store derived columns on raw (derive at
  the layer that owns the derivation).
- A derived column with no provenance or derivation version cannot be trusted
  or safely refreshed.
