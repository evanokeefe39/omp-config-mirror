---
name: pb-source-discovery
description: "Recon an unknown source: classify, cheap evidence, budgeted probes, gated contract."
---
## When

A new external source of any kind; a source whose behaviour is unknown; choosing
a transport or client for a source; or an existing source that keeps failing in
production because its transport, rate limits or status semantics were never
written down.

Not: implementing a producer on an already-recorded contract (`pb-data-source-onboarding`);
a data-quality incident on a producing source (`pb-data-quality-incident`);
writing a behavioural spec (`pb-spec`).

Use for discovering and recording what a source actually does. Once the contract
is gated, `run pb-data-source-onboarding` implements the producer on it.

## Outcome

A gated per-source contract: transport and impersonation target, auth,
pagination, rate limits and which kind of 429, retry/backoff policy, special
statuses, pacing and concurrency, egress/proxy routing, unit cost, failure
modes, and raw retention/replay — every field answered or explicitly blocked —
plus a registration test for the source and a re-runnable investigation
notebook a human can follow. No probe ran without a declared budget, and
nothing downstream starts on an ungated contract.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- The contract carries every field — transport and impersonation target, auth,
  pagination, rate limits with which kind of 429, retry/backoff policy, special
  statuses (202/403/5xx), pacing/concurrency, egress/proxy routing, unit cost,
  failure modes, raw retention/replay — each answered or explicitly blocked
- The probe budget (max requests, max wall time, max cost) was declared before
  the first probe ran, and what the probes found is recorded in the contract
- The investigation notebook exists at `docs/source-discovery/<source>.ipynb`:
  every avenue tested carries its library, method and evidence; the parse
  decision and the rejected options carry their reasons; the final shape and
  the ODC/ODCS terms the source forces are stated; and each cell re-runs clean
  on its own
- The gate passed with a registration test for the source and the notebook
  gate, or is blocked with the unanswered fields named
- Reply: the transport decision and its evidence, the declared probe budget and
  what it bought, the notebook path, and any contract fields still blocked.
