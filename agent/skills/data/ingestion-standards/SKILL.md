---
name: ingestion-standards
description: >
  Normative, vendor-neutral ingestion standards a reviewer can fail a change
  against, indexed by platform stage (1 Sproutling / 2 Tinkerling / 3
  Stackbeast / 4 Lakewarden / 5 Meshwyrm / 6 Leviathan) and contract maturity
  (Absent/Implicit/Defined/Enforced): a per-source contract adapting dlt and
  Airbyte vocabulary, HTTP semantics (transient set, Retry-After, the two
  kinds of 429, special statuses), pacing, egress, probe budgets, raw landing
  before parsing, partial progress, robots/legal floors, and transport
  conformance pins. Technique lives in `skill://ingestion-best-practices`.
---

# ingestion-standards — reviewer-enforceable ingestion requirements

Normative requirements for ingestion work: vendor-neutral, research-backed
(RFC 9110, RFC 9309, RFC 6585, the RateLimit headers draft, connector
frameworks' own requirements), maturity-indexed, and written so a reviewer can
fail a change against them. Advisory technique and per-source discovery
methods live in `skill://ingestion-best-practices`; Dagster wiring in
`skill://dagster-expert-extra`; the stage assessment itself is
`skill://pb-maturity-assessment`.

`Not:` advisory technique. Every requirement here is reviewer-enforceable;
anything phrased as how-to belongs in `skill://ingestion-best-practices`.

## How to read the tags

Every requirement carries `[stage N]` — the **lowest platform stage at which
it applies** — on the field guide's six stages: 1 Sproutling, 2 Tinkerling,
3 Stackbeast, 4 Lakewarden, 5 Meshwyrm, 6 Leviathan. The guide's own reading
rules govern application: evolve on a trigger, not ambition (`:167`); don't
skip stages (`:168`); most platforms should stop early (`:171`); stages are
archetypes, not scores (`:166`).

Contract maturity uses the same guide's four levels — Absent / Implicit /
Defined / Enforced (`:176`). "Written down in a reviewed artifact" is
Defined; "checked automatically or in CI" is Enforced.

## Reviewer authority

- Determine the platform stage with `skill://pb-maturity-assessment`, then
  apply every requirement tagged **at or below** that stage. A missing field
  or behaviour below its stage is a **fail**, not a nitpick.
- An unanswered per-source contract field fails the change. Recording a
  field as explicitly blocked (with the reason) is answering it; leaving it
  blank is not.
- **A contract lesson recorded but never promoted to a field never fires.**
  Every requirement here must be writable into an artifact — a per-source
  contract field, a config key, or a design vocabulary. The pattern this rule
  names (anonymised): a source's contract notes recorded exactly the
  knowledge that later cost a port — that its 202s were challenges, that its
  client had to impersonate — but no contract field, config key or design
  decision had a slot for either, so nothing read the notes when the source
  was rebuilt on a plain client, and the rebuild burned undeclared probe
  requests discovering it. Write the lesson where it fires.

## Stage 1 — floor (Sproutling)

- **Keep raw payloads** — the raw response landed durably **before** any
  parsing or transformation, as a simple append-only record per response:
  run id, source, url, method, status, response headers, body bytes,
  fetched_at. Parse a copy, never only the parsed form. Capture everything,
  transform nothing at the landing layer (no row filters, no business logic;
  store fields permissively to survive upstream schema change) `[stage 1]`
  (`:213` floor; `:217` risk "data parsed wrongly is lost for good"). If
  archival provenance or interchange with archive tooling is later needed,
  upgrade the record to WARC (ISO 28500, e.g. via `warcio`) — an option, not
  a requirement.
- **One module per source** — a source's fetch lives in one unit; no shared
  mutable fetch logic across sources `[stage 1]`.
- **Name an owner per source; keep secrets out of code and out of logs** —
  secrets live in a secret store, never in code or config; tokens, session
  ids and API keys appear in logs only truncated or hashed, never in full
  `[stage 1]` (`:213`; OWASP Secrets Management and Logging cheat sheets).
- **Identify the client** — the User-Agent names the client and a contact
  (role-based URL or email, not a personal address) `[stage 1]`
  (RFC 9309 §2.2.1; crawler best-practices draft).
- **Never bypass authentication, paywalls or login walls** — "publicly
  accessible" is not "authorised" once a credential is used; record which
  sources are accessed with credentials `[stage 1]` (crawler best-practices
  draft; courts treat logged-out public scraping and logged-in access as
  different risk regimes).

That is the whole standard at stage 1. Everything below waits for stage 2.

## Stage 2 — additions (Tinkerling)

- **Retries on every per-source module** — a retry policy named per source,
  covering an **enumerated transient set** and transport errors `[stage 2]`
  (`:224` "a module per source on a shared pattern, **with retries**"). The
  transient set is enumerated, never a blanket class: `500` `502` `503` `504`,
  `429`, and `408` where the source actually uses it. `501` (Not Implemented)
  is never retryable. Most other `4xx` are not retry candidates — a retry
  does not resolve them (Azure transient-fault guidance). For CDN-fronted
  sources, record how edge-generated errors are distinguished from origin
  errors before classifying either transient.
- **Backoff shape named per source, one retry owner** — failure-driven
  retries use **capped exponential with full jitter**
  (`min(cap, base * 2^attempt)`); unbounded exponentials are a defect. The
  contract names which layer owns retries — retries across layers multiply,
  not add (5 layers × 3 attempts = 243 deepest attempts), so retries live at
  a single point in the stack `[stage 2]` (AWS Builders' Library). Per-source
  connect and read timeouts, sized from observed latency, never a shared
  default `[stage 2]`.
- **Retry-After honoured per response** — when a response carries
  `Retry-After`, honour it in both forms (delay-seconds integer, HTTP-date);
  the server-provided wait takes precedence over any client-computed
  backoff, and is capped at a declared maximum (a maintenance-window `503`
  can declare an hour-scale wait) `[stage 2]` (RFC 6585; RFC 9110 §15.6.4).
  A rate-limited request honoured this way does **not** consume the retry
  budget — a 429 loop must not exhaust the bounded try count while quota
  clears `[stage 2]` (connector frameworks' Retry-After handling). Adaptive
  per-domain throttling is a separate layer `[stage 3]`.
- **The two kinds of 429, distinguished** — *slow-down* (transient: honour
  `Retry-After` when present, otherwise capped exponential backoff with
  jitter, retry within budget) versus *out-of-quota* (prolonged or
  header-signalled out-of-quota — stop rather than burn budget; a retry
  converts quota errors into burned budget). Where the server uses problem
  details, the quota-exceeded problem type is the discriminator `[stage 2]`
  (RateLimit headers draft §5.1).
- **Special-status semantics** `[stage 2]`:
  - `202` branches on evidence, not on the number: at a documented async
    endpoint whose response points to (or embeds) a status monitor, `202`
    means *accepted* — persist the handle and poll the monitor (RFC 9110
    §15.3.3). With an HTML/JS body, WAF challenge headers, or no status
    monitor at an undocumented origin, `202` is challenge-class — **stop
    the source loudly**; never retry it as if it were the payload.
    Undocumented default: stop.
  - `403` is non-retryable by default. Retry it only when a **documented
    body/header signal** identifies quota exhaustion (an error reason,
    `RESOURCE_EXHAUSTED`, or rate-limit headers the source documents), within
    a small budget; otherwise stop and record. Challenge-class responses
    carrying `403` are detected by their discriminators — `cf-mitigated:
    challenge`, `x-amzn-waf-action: challenge`/`captcha` — never answered,
    never retried (a challenge is fixed by changing the client or by
    stopping, not by waiting).
  - `401` is a credential failure, not a transient error: refresh the
    credential once; if the refresh fails, stop that source loudly — never
    loop `401`s through the retry policy.
- **No automatic retry of non-idempotent methods** — `POST`/`PATCH` are not
  automatically retried unless the operation is known idempotent or an
  idempotency key is declared in the contract and sent unchanged on every
  attempt `[stage 2]` (RFC 9110 §9.2.2; idempotency-key header draft).
- **Pacing and concurrency declared** — max concurrency and minimum interval
  per source, so modules cannot pile-drive one origin; this isolation is the
  bulkhead that keeps one source's failure storm out of the shared pool
  `[stage 2]` (well-architected bulkhead pattern). Success-driven pacing is
  **declared pacing** (fixed or latency-adaptive per-domain delay); it is a
  different mode from failure-driven backoff, and the contract names which
  mode applies `[stage 2]` (AutoThrottle-style adapters respect the declared
  floor and never lower it).
- **robots.txt obeyed per RFC 9309** — follow the matching product-token
  group, fall back to `*`, cache at most 24 hours. The 4xx/5xx asymmetry is
  mandatory: a `4xx` robots.txt means unavailable (crawler MAY access); a
  `5xx` or network error means unreachable — **assume complete disallow**
  until it is back `[stage 2]` (RFC 9309 §2.3.1.3–4, §2.4).
- **Legal and privacy floors per source** — a ToS/AUP review recorded before
  the first fetch, noting account use and whether the target data sits
  behind a login wall `[stage 2]`; the fields collected and their stated
  purpose listed, and fields outside the purpose not collected `[stage 2]`
  (GDPR Art. 5(1)(c) minimisation). A challenge is never answered
  programmatically — no auto-solving CAPTCHAs; a challenge stops the source
  and is recorded as a failure mode (defeating anti-bot tech is a distinct
  legal theory from accessing public data) `[stage 2]`.
- **Registration test exists and runs** — new sources are registered
  everywhere the shared pattern requires, and a test proves it `[stage 2]`
  (`:245`; stage-2 reality is hand registration in several places, where
  "registrations are easy to miss silently").
- **One shared pattern** — a new source follows the same shape as the existing
  ones; per-source differences live in that source's contract, not in a
  forked pipeline; source-contract maturity must reach Defined (rate limits
  and quirks written in a reviewed artifact) `[stage 2]` (`:224`; `:232`;
  risk `:249` "each source becomes a slightly different pipeline, and
  conventions drift").
- **Raw partitioned by run date so runs replay** `[stage 2]` (`:224`); raw
  landed durably **before** any transform, and network I/O lives only at the
  ingestion seam, never inside a pure transform `[stage 2]`.
- **Checkpointing at page/batch boundaries** — state persists durably at
  pagination or batch boundaries so an interrupted run resumes from the last
  checkpoint instead of reprocessing everything; for incremental sources the
  high-water mark is durable state, with unsorted replication keys declared
  (bookmark advances only at stream completion) `[stage 2]` (connector SDK
  checkpoint guidance; Singer STATE).
- **Partial progress vs all-or-nothing, declared** — the contract states
  which, and per-item failure tolerance with it (skip-and-count, ratio gate,
  or abort): a single bad item must not silently void a source unless the
  contract says all-or-nothing. A replay of the same run date is idempotent
  (no duplicates, no corruption) `[stage 2]`.
- **Per-source guardrail** — a producer that feeds consumers ships a check
  that **fails on silent whole-source dropout or staleness** (row coverage
  plus a freshness window) `[stage 2]`; wired into alerting or CI
  `[stage 3]`. This is the check that catches "a 429 became unreachable and
  the source stored nothing for the day" behind a green tree.
- **Run-level outcome fails when any declared source fails** — the run's own
  status aggregates per-source outcomes; no healthy source masks a failed
  one ("one healthy source = green" is the failure this forbids) `[stage 2]`.
- **Failure modes named per source** — what each failure looks like for this
  source: challenge page, empty-200, soft-404, silent truncation,
  unreachable host `[stage 2]`.
- **Unit cost and probe budget** — unit cost estimated, and a probe budget
  (max requests, max wall time, max cost) declared **before** probing an
  undocumented or adversarial source `[stage 2]`.
- **The conformance suite is written** — every transport adapter has the
  same pins asserted against it (see Transport conformance pins below)
  `[stage 2]`.

Learning a rate limit by getting blocked is the stage-1 failure mode
(`:192`); writing it down at stage 2 is what stops it repeating.

## Stage 3 — additions (Stackbeast)

- **Automated per-domain throttling** honours `Retry-After` (a standard
  signal) and may honour robots `crawl-delay` as a recorded per-source
  courtesy — `crawl-delay` is a **non-standard** extension the robots
  protocol does not define, with major engines disagreeing on it, so it is a
  throttling input the contract records, never a universal normative rule
  `[stage 3]` (RFC 9309 omits it).
- **RateLimit headers are advisory only** — `RateLimit`/`RateLimit-Policy`,
  when present, may pace proactively, but they are hints: ignore malformed
  fields, never treat available quota as a guarantee, never assume they
  appear again, and let `Retry-After` take precedence when both appear. The
  normative pacing mechanism stays the declared per-source min interval and
  max concurrency, not header-dependent `[stage 3]` (RateLimit headers draft
  §4.1.1, §7.6–7.7, §7.11).
- **Conditional GET when validators are offered** — on re-fetches, send
  `If-None-Match` with stored entity tags (or `If-Modified-Since` with
  `Last-Modified`) and treat `304` as "reuse the stored representation"
  `[stage 3]` (RFC 9110 §13.1.2).
- **TDM opt-out detection where applicable** — detect and record
  machine-readable rights reservations where the jurisdiction requires them
  (`TDM-Reserved` response header or `/.well-known/tdmrep.json`) `[stage 3]`
  (TDMRep, W3C Community Group report).
- **Declared retention window** — deletion happens only through authorised
  governance workflows, never ad hoc `[stage 3]`.
- **Dedicated egress for challenge-prone sources** `[stage 3]`.
- **Guardrail wired into alerting or CI** `[stage 3]`.
- **The conformance suite is enforced** — it runs in CI on every change to a
  transport adapter or its source contracts `[stage 3]`.

## The per-source contract

Every field answered, or explicitly recorded as blocked with the reason — a
blank field fails the change. Fields are **written** at `[stage 2]` and
**enforced** at `[stage 3]`. Field names adapt dlt's REST API source
vocabulary and Airbyte's low-code manifest vocabulary; naming a field after a
framework is a convention only — **no framework dependency is implied**.

| field | names | vocabulary |
|---|---|---|
| `transport` | the client library, and the impersonation target where relevant, with the TLS-fingerprint grading evidence | invented (neither framework has a slot) |
| `session` | shared session vs one session per request | invented (neither framework has a slot) |
| `auth` | auth scheme and credential class — token, API key, OAuth with refresh semantics | dlt `auth` |
| `paginator` | pagination strategy — cursor, offset, page token, link header | dlt `paginator` |
| `incremental` | cursor path, high-water mark durability, sorted-or-not, overlap window | dlt `incremental` |
| `retry` | transient statuses and transport errors, backoff strategy (capped exponential, constant, wait-time-from-header, wait-until-time-from-header), cap, budget, owning layer, connect/read timeouts | Airbyte `backoff_strategies` |
| `response_actions` | per-status semantics — the slow-down/out-of-quota 429 split, the 202 branch, the 403 carve-out, the challenge stop | dlt `response_actions` |
| `rate_limit` | the source's declared rate-limit headers (remaining, reset) when it publishes them — advisory only | Airbyte `HTTPAPIBudget` (`ratelimit_remaining_header`, `ratelimit_reset_header`) |
| `egress` | direct, proxy or dedicated egress | invented (neither framework has a slot) |
| `probe_budget` | max requests, max wall time, max cost — declared before probing | invented (neither framework has a slot) |
| `partial_progress` | skip-and-count vs ratio gate vs abort; checkpoint grain; replay idempotence | invented (neither framework has a slot) |
| `guardrail` | row-coverage bounds and the freshness window (warn/error) | invented (neither framework has a slot) |
| `failure_modes` | challenge page, empty-200, soft-404, silent truncation, unreachable host | invented (neither framework has a slot) |
| `legal` | ToS/AUP review, login-wall boundary, TDM opt-out signal where applicable | invented (neither framework has a slot) |

## Transport conformance pins

Every transport adapter — plain HTTP client, TLS-impersonating client,
anything else that can sit under a source module — must pass the same
conformance suite. The suite is **transport-agnostic**: it is built on
injected stub transports (a scripted send/session per transport returning
canned responses) and asserts numbers and classifications — no wall-clock
sleeps, no live network, no record-replay cassettes (cassettes replay HTTP
transcripts and cannot exercise behaviour below the HTTP layer, such as TLS
fingerprinting).

The pins every adapter must pass, `[stage 2]` written / `[stage 3]` enforced:

1. Retries follow the declared transient set and budget, with capped
   exponential backoff plus jitter.
2. `Retry-After` is honoured and capped, in both forms.
3. A slow-down `429` retries within budget and does not consume the retry
   budget; an out-of-quota `429` stops.
4. A challenge-class response stops the source; nothing retries it.
5. A transport failure (DNS, connect, read timeout) charges nothing — it is
   not billed as a `429`-style stop.
6. A dead host is classified **unreachable**, never as a budget stop.

The tags: **written at stage 2** because connector frameworks make the
acceptance suite part of *declaring* a connector — auth, rate limits,
pagination and error semantics are declared per connector before it ships,
tested against one shared set rather than discovered incidentally in syncs;
**enforced at stage 3** because CI-on-every-change is the same step at which
every other contract field flips from written to enforced (the ladder's
"declare it with freshness and tests" onboarding, `:280`).

## What is deliberately NOT required

- **Below stage 2** — no contract file, no registration test, no mandated
  retries, pacing, probe budget, conformance suite or transport record.
  Copying the last script and learning a rate limit by getting blocked once
  is the stage-1 mode (`:192`, `:213`). The stage-1 floor (raw record before
  parsing, one module per source, owner, secrets out of code and logs) is not
  waived.
- **Below stage 3** — no CI-enforced gates, no throttling manager, no
  automated alerting, no declared retention windows, no conditional GET,
  no TDM detection. "Run status and a few checks, alerting one inbox" is the
  stage-2 observability budget (`:235`).
- **Below stage 4** — no platform team, no org-scale governance; team
  separation starts at Lakewarden (`:287-289`). A stage-2 platform must not
  be asked to split repos or stand up a team for ingestion.
- **Stages 5-6** — organisational-scale stages (`:171`); do not demand them
  of a small platform.

## Failing a change

1. Take the stage from `skill://pb-maturity-assessment`.
2. Check every requirement tagged at or below it — the contract fields,
   transport/retry/429 semantics, special statuses, robots and legal floors,
   raw landing, partial progress, guardrails.
3. Fail on any unanswered field or missing behaviour; accept an explicit
   blocked recording with its reason.
4. For a transport adapter change, confirm the conformance pins exist
   (`[stage 2]`) and run in CI (`[stage 3]`).
5. If a requirement here names a field no artifact has, the standard is
   wrong — send it back to this file; do not fail the artifact.
