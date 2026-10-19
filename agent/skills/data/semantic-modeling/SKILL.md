---
name: semantic-modeling
description: >
  Design the semantic/gold layer of a data warehouse — what belongs in the
  semantic layer vs the client, facts and dimensions, conformed measures, and
  how a metric is defined once upstream and consumed everywhere. Use when
  building or changing consumer-ready/mart/gold assets, defining metrics, or
  deciding whether a value should be derived in the warehouse or computed in a
  dashboard/client. Complements the vendor dagster-expert and duckdb skills
  (they cover Dagster mechanics and DuckDB primitives; this covers the semantic
  layer craft neither teaches). Load alongside `skill://dagster-expert` /
  `skill://duckdb` when working on gold/marts or any metric consumed by a UI.
---

# Semantic modeling (gold layer)

## The core invariant: render vs derive

A metric is **defined once, upstream, and consumed everywhere**. Decide where a
value is derived by asking: is this a *fact about the data* (derive it in the
semantic/gold layer) or a *presentation choice* (render it in the client)?

- **Derive in the warehouse** (gold/semantic layer): any measure or metric —
  counts, sums, rates, ratios, aggregations. Defined once, so every consumer
  agrees.
- **Render in the client**: formatting, layout, axis choices, colors. Never a
  computation of a metric that exists upstream.
- If a dashboard needs a metric it does not have, the fix is **upstream** — add
  it to the semantic layer — never a client-side re-derivation. A client-side
  formula duplicates and drifts from the semantic layer. (Rule:
  `metrics-derived-upstream`.)

## Facts and dimensions

- **Facts** carry measures — the numeric, additive core of analysis (events,
  transactions, usage). Measures are the "how much/how many."
- **Dimensions** provide the *context* to slice facts by (time, source, model,
  repo, agent). A fact is analyzed along its dimensions.
- Fact tables are long and skinny; dimension values are shared and reusable.

## Conformed measures

A measure used by more than one consumer is **conformed**: it has one canonical
definition, one name, one derivation, living in the semantic layer. No two
places may compute "the same" metric differently — when they disagree, one is
wrong and consumers can't tell which.

- Name and define the metric once; every consumer reads that definition.
- When a metric's meaning changes, change it once upstream; re-validate every
  consumer (see rule `change-review-blast-radius`).

## Provenance

Every derived/mart asset carries provenance: its source inputs, the derivation
version, and when it was produced. A derived value with no traceable origin is
untrustworthy. (Rule: `provenance-on-derived`.)

## Working practice

Before building any gold/mart/consumer-ready asset:

1. Read the repo's existing gold/marts and semantic conventions first — extend,
   don't reinvent.
2. Define metrics once in the semantic layer, never in a client.
3. Read `skill://dagster-expert` (mechanics) + `skill://duckdb` (primitives)
   alongside this for the platform side.
