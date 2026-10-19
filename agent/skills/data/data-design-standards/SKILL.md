---
name: data-design-standards
description: Domain design checklist for the data-designer: every candidate is screened against contract, grain, layering, lineage, evolution and failure items before it is returned.
---

Not: this skill does not replace `pb-design` — it is the screening checklist the
data-designer applies to its own candidate inside pb-design's diverge step.

## Design checklist

Screen every candidate against each item; a failed item goes into `risks`, never silently.

- **Data contract before pipeline.** Name the ODCS data contract fields the design
  commits to — schema, semantics, quality, ownership, servers and SLOs — not just the
  schema. A schema alone is not a contract. (ODCS, Bitol / Linux Foundation data
  contract standard: https://bitol-io.github.io/open-data-contract-standard/)
- **Kimball 4-step, grain first.** Select the business process, declare the grain, then
  identify dimensions, then facts. Never start with tables. (Kimball, *The Data
  Warehouse Toolkit*, ch. 2: https://www.kimballgroup.com/data-warehouse-business-intelligence-implementation-tutorials/)
- **Medallion placement, and what it is not.** State which layer (bronze/silver/gold)
  each artifact lands in and why. Bronze/silver/gold is a layering pattern for
  progressive validation and serving, not a governance, semantic or ownership model.
  (Medallion architecture, Databricks: https://www.databricks.com/glossary/medallion-architecture)
- **Operational metadata.** For each pipeline edge, name lineage, freshness SLO,
  retention, and privacy classification. (Spec-driven design deep research 2026,
  "Data architecture" row on the practical data feature spec:
  a research scope `findings/spec-driven-design-2026-deep-research.md`)
- **Schema evolution and compatibility.** Name the compatibility mode consumers can
  rely on (backward, forward, full) and what happens on a breaking change.
  (ODCS contract + compatibility clauses; see the ODCS link above)
- **Failure behaviour.** For each upstream failure mode, say what the design does:
  halt, degrade, quarantine, or reprocess — and what the consumer observes.

## Sources

- ODCS data contract standard (Bitol/Linux Foundation)
- Kimball dimensional design, 4-step method
- Medallion architecture (Databricks glossary)
- `findings/spec-driven-design-2026-deep-research.md`, §Data architecture
  (a research scope, branch `docs/findings-spec-driven-design`)
