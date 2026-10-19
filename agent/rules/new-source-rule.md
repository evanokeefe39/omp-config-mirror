---
description: A new data source / ingestion path / bronze-raw producer is a NEW FEATURE, never an inline bootstrap or one-off migration. The first member of a source family creates the shared contract and chooses the transport (pb-source-discovery, then pb-design); later members are producers on that contract, never parallel pipelines or migration scripts — a migration that copies what a producer should do creates a second codepath that rots.
alwaysApply: true
agents: ["data-*"]

---

# new-source-rule

Introducing a new data source, ingestion path, or raw producer is a feature,
not a script. Which kind of feature depends on the source's position in its
family.

## First member of a family

The first source of a kind creates the shared contract and chooses the
transport. That is design work, not a routine producer:

- Route it through `run pb-source-discovery` — classify the source, recon the
  cheap documented evidence first, probe only under a declared request/time/cost
  budget, record and gate the per-source contract.
- Establish the shared producer component and contract through `run pb-design`
  and `run pb-feature` before any sibling is onboarded.

## Subsequent members

- Read the repo's ingestion/bronze contract and existing producers first.
- If data conforms to an existing contract, add a producer to that contract (a
  second source feeding the same pipeline) — not a parallel pipeline.
- A one-off backfill/bootstrap script is acceptable ONLY when it is explicitly
  what the brief asked for, or the target layer has no reusable producer
  contract.
- Propose the approach in the plan/issue before code when the source is new.
