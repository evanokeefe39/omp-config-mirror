---
name: ingestion-best-practices
description: >
  Advisory ingestion technique: per-source-type discovery methods (documented
  OpenAPI/Swagger API, undocumented HTTP API, HTML/sitemap scrape, database,
  stream, paid API, file drop), adversarial-dependency techniques (WAF
  challenge vs rate limit, session model, 202 semantics, TLS-fingerprint
  grading), conformance testing technique, ingestion shapes, and
  proportionate isolation choices. Normative, reviewer-enforceable
  requirements live in `skill://ingestion-standards`.
---

# ingestion-best-practices — advisory technique

How to discover a source, handle adversarial dependencies, and pick shapes
and isolation. Nothing here is a requirement: anything normative belongs in
`skill://ingestion-standards`, and Dagster wiring in
`skill://dagster-expert-extra`.

`Not:` a standard. Nothing in this file is reviewer-enforceable.

## Discovery methods by source type

Classification selects the method. Every method ends in the per-source
contract fields of `skill://ingestion-standards`.

### Documented API (OpenAPI/Swagger)

- Read the spec before any probe: auth scheme, documented rate limits,
  pagination style, error semantics, webhook/callback options.
- Contract-test the client against the spec — generate a client, or
  hand-check a small wrapper against the schema — so drift is caught at test
  time.
- Verify the spec against reality on one cheap endpoint before building on
  it; specs drift from servers, and the drift is itself a contract finding.
- Where a machine-readable spec exists, property-based conformance testing
  generated from it (Schemathesis against OpenAPI) replaces hand-written
  probe scripts; only documented/paid APIs publish specs, scraped HTML never
  does.

### Undocumented HTTP API

- Probe, with the budget declared first (the declaration is required by
  `skill://ingestion-standards`). Infer the schema from real responses;
  confirm each inferred field on a second sample.
- Capture the browser devtools HAR for the real endpoints, headers and query
  parameters — the UI's network tab is the true spec.
- Watch for WAF behaviour from the first request, not the tenth; an early
  challenge changes the transport decision, not the retry policy.
- Look for unofficial client libraries and read their issue trackers — they
  encode quirks someone already paid for.

### HTML/sitemap scrape

- robots.txt and crawl-delay first, ToS/AUP second — before the first fetch,
  not after the first block. robots handling follows RFC 9309, including the
  4xx/5xx asymmetry: a 4xx robots.txt means unavailable, a 5xx means assume
  complete disallow.
- Treat `crawl-delay` as a per-source courtesy input, not a standard — the
  robots protocol does not define it and major engines disagree on honouring
  it.
- Respect sitemap protocol limits (URLs and uncompressed size per file) and
  treat `<lastmod>` as advisory; `<changefreq>`/`<priority>` are ignored by
  the major engines.
- Test TLS-fingerprint grading in both directions before committing to a
  transport (see Adversarial dependencies): impersonating a browser is not
  automatically safer.
- Check actor marketplaces (e.g. Apify) for an existing maintained actor
  before writing a scraper; adopting one is cheaper than maintaining one.

### Database

- Identify dialect and version first — syntax, incremental-read tooling and
  CDC support differ by engine.
- Find an incremental key (updated_at, a monotonic id) and confirm its
  semantics: does it tick on every change, what timezone, are updates
  distinguishable from inserts.
- Choose CDC versus polling by change volume and latency need, not fashion;
  polling on an incremental key is the boring default that usually wins.

### Stream

- Establish offset/checkpoint semantics first: who stores the offset, what a
  rewind costs, whether replay is possible at all.
- Cut the stream at a chosen boundary (window close, watermark) for batch
  consumers rather than modelling it as unbounded.

### Paid API

- Establish cost per unit before any call, and budget the probe before
  probing.
- Ask whether a refusal burns a credit or a session — some APIs bill
  declined calls; that changes what an experiment costs.
- Prefer batch endpoints and cache aggressively: a paid API is the cheapest
  source to over-query and the most expensive to re-run.

### File drop

- Establish the watch mechanism (poll versus event) and — more important —
  the completeness signal (a `_SUCCESS` marker, a manifest, row counts) so a
  half-written file is never ingested.
- Decide schema-drift handling up front (reject, coerce, quarantine) and
  make re-ingesting the same file idempotent.

## Adversarial dependencies

- **WAF challenge versus rate limit.** Classify by signal, not by "is it an
  error". Rate limits arrive as `429`, usually with `Retry-After` and a
  machine-readable body, and are fixed by waiting. Challenges arrive as
  `403` or `202` with an HTML/JS body or a distinctive header set —
  `cf-mitigated: challenge` on interstitial challenge pages, `x-amzn-waf-action:
  challenge`/`captcha` (AWS WAF answers its challenge action with `202` and
  captcha with `405`) — and are fixed by changing the client — transport,
  impersonation, session model — or by stopping. Status alone is not enough:
  a challenge and a block can look almost identical on the status line, so
  response headers and body shape must join the classifier. Backing off
  harder against a challenge just burns requests against a grader that
  remembers.
- **One session per request versus a shared session.** A fresh session per
  request drops cookie/session continuity: some graders then trust the
  request more, others less. Impersonation is not automatically safer either
  — one recorded contract showed an impersonating client challenged while a
  plain client passed. Grade empirically in both directions and record the
  result in the per-source contract.
- **Reading a 202 by evidence.** A 202 means "accepted for processing", not
  "here is the data" (RFC 9110 §15.3.3 — the representation ought to point
  to or embed a status monitor). At a documented async endpoint that is the
  contract: submit, persist the handle, poll the monitor. At an undocumented
  or adversarial origin — an interstitial HTML/JS body, WAF challenge
  headers, no status monitor — a 202 is challenge-class: stop the source
  loudly, never retry it as if it were the payload, and never store the
  interstitial body as if data arrived — that is a silent failure wearing a
  success. Record the semantics in the contract.
- **Probe hygiene.** Keep a probe log as you go — request, response class,
  cost. The per-source contract's evidence is the log, not memory, and the
  declared budget is what makes stopping when it is hit easy.

## Conformance testing technique

- Resilience pins (retry set, Retry-After caps, 429 classification, challenge
  stop, transport-failure accounting) run against **injected stub
  transports**: scripted send/session responses per transport, asserted
  numbers and classifications, no wall clock, no live network. The pins are
  reviewer-enforceable and live in `skill://ingestion-standards`.
- Record/replay cassettes (VCR-style) are a device for freezing a source's
  real interactions as fixtures, not the conformance mechanism: they replay
  HTTP transcripts and cannot exercise TLS fingerprinting or anything below
  the HTTP layer.

## Ingestion shapes

Pick by where latency and durability live:

- **Synchronous request-response** — data arrives in the same call. Fetch
  boundedly: keyset pagination, chunked or streamed batches, never one giant
  payload. Cursor/keyset pagination beats offset wherever the source offers
  it — offsets skip or duplicate rows under concurrent writes; where offset
  pagination is unavoidable, record a stable sort and an overlap re-read.
- **Async external job** — the external system holds the result until done
  (a scrape actor, an async batch query). Submit, persist the handle, fetch
  when complete. Treating it as a blocking call holds a worker open for the
  job's whole life; this is the shape whose healthy 202 carries a status
  monitor to poll.
- **Unbounded stream** — never ends, so it must be cut at a chosen boundary
  for any batch consumer (see Stream above).

Each shape changes what "a run" means; the per-source contract records which
one applies. The Dagster mapping of these shapes lives in
`skill://dagster-expert-extra`.

## Isolation and execution environment

Cheapest that works first; move up on a trigger, not ambition (`:167`):

- **In-process module** — a module in the orchestrator's process. Right for
  stage 1-2 and low volume, where a hung source is an annoyance, not an
  outage.
- **Separate process / queue** — when a source crashes, hangs, or needs a
  different runtime (a browser, a TLS stack the orchestrator does not ship),
  isolate it behind a subprocess or queue. Stage 2-3.
- **Separate service** — high volume, independent scaling, or multiple
  consumers of the same fetch. Stage 3+, and an infrastructure decision, not
  a code-organisation one.

This ladder is about processes, not repos: the field guide does not
recommend a separate repo or team for the platform before stage 4
(Lakewarden, `:287-289`).
