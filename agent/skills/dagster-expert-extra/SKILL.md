---
name: dagster-expert-extra
description: >
  Dagster-specific ingestion mechanics the vendor dagster-expert skill does
  not carry — mapping ingestion shapes onto runs and sensors, never blocking
  a Dagster run on an async job, the landing-zone/bronze pattern, and the
  RetryPolicy-vs-HTTP-client layering. Vendor-neutral ingestion requirements
  (transport, retry/backoff, the two kinds of 429, special-status semantics,
  pacing, per-source guardrails, raw-before-transform) live in
  `skill://ingestion-standards`; shape-selection and discovery technique in
  `skill://ingestion-best-practices`. Load ALONGSIDE the vendor
  `skill://dagster-expert` whenever writing an ingestion/asset producer, not
  instead of it.
---

# Dagster ingestion mechanics

Companion to the vendor `dagster-expert` skill — the canonical mechanics
reference. This skill carries only what is Dagster-specific: how the
ingestion shapes map onto runs, sensors and assets. The vendor-neutral
requirements — transport selection, retry/backoff, the two kinds of 429,
special-status semantics, pacing, per-source guardrails, raw-before-transform
— live in `skill://ingestion-standards` and apply to every shape below.

## Map the ingestion shape onto Dagster runs and sensors

Three shapes (shape-selection technique: `skill://ingestion-best-practices`):

- **SYNCHRONOUS request-response** — fetch in a bounded run. No sensor;
  nothing to wait on between calls.

- **ASYNC external job** — the external system holds the result until it is
  done. **Dagster MUST NOT block a run on it**: submit → persist the handle
  (run_id / job_id / dataset_id) → END the run. A cursor sensor polls for
  terminal state and issues a RunRequest to the HARVEST run. If it hands you
  a token/status URL to poll, it is async — treat it so even when the submit
  call "returns immediately". Blocking a run on poll/wait for an async job
  (holding a run slot open for hours) is a known bug.

- **UNBOUNDED STREAM** — Dagster is batch (why and where to cut the stream:
  `skill://ingestion-best-practices`). Micro-batch drain (interval sensor;
  cursor = the committed offset) when latency allows, OR a dedicated stream
  engine owns the hot path and Dagster orchestrates the landed table
  (external asset / freshness / asset sensor). Do not model a never-ending
  stream as an asset materialization.

- **All shapes:** the raw-before-transform standard of
  `skill://ingestion-standards` lands here as the landing zone / bronze +
  media-cache pattern.

## Retry and guardrail wiring

- Per-request retry/backoff and 429 handling are an HTTP-client concern — the
  requirement and its kinds live in `skill://ingestion-standards`. A Dagster
  op/asset `RetryPolicy` is a separate layer: it re-runs the whole op.
- Implement the per-source guardrail required by
  `skill://ingestion-standards` as a Dagster asset check on the base/bronze
  asset. (Rules: `dormant-vs-broken`, `qa-codified-every-layer`.)
