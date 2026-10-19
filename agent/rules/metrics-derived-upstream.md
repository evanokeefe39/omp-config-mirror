---
description: Metrics live in the semantic/gold layer, never computed in a client. When a dashboard/frontend needs a metric it does not have, add it upstream (semantic layer / warehouse) and consume it — never derive the metric client-side.
alwaysApply: true
agents: ["data-*", "ux-*", "app-backend-*"]

---

# metrics-derived-upstream

A metric is defined once, upstream, and consumed everywhere. It is never
re-derived inside a client, component, or page.

- Render values; do not compute them. If the dashboard lacks a metric, the
  fix is upstream (gold/semantic layer), not a client-side calculation.
- A client-side derivation duplicates the semantic layer, drifts from it, and
  can disagree with every other consumer.
- See `skill://semantic-modeling` for what belongs in the semantic layer vs the
  client.
