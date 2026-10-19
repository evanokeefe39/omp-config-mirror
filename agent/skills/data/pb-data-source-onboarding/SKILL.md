---
name: pb-data-source-onboarding
description: "Add ONE new data source end-to-end - declared against an existing source contract, implemented as a producer on the shared component, smoke-proven on one real unfiltered item, registered with a dropout guardrail."
---
## When

Onboarding a new external or internal source onto an existing source contract.

Not: a data-quality incident on an existing source (`pb-data-quality-incident`);
a schema change on an existing table (`pb-data-schema-migration`); more than
one source in one run — one source per run, so N new sources are N runs of this
playbook, each against the family's contract; a source whose behaviour or
transport is unknown, or the first member of a source family — that routes
through `run pb-source-discovery` and, for a first member, `run pb-design` /
`run pb-feature` before this playbook runs (see the read-contracts phase).

## Outcome

The source declared, implemented as a producer on the shared component, smoke-proven
on one real unfiltered item, and registered with a guardrail that fails on silent
whole-source dropout.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- One real unfiltered item landed, with its row count, schema and nulls read back
- The dropout guardrail fires when the source goes silent, and the source's observation path is stated
- Reply: which contract the source extends, what landed in the smoke, and the check that would catch its dropout.
