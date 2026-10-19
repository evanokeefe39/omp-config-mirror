---
name: provider-optimize
description: >
  Optimise model provider routing to cut cost without wrecking quality, for every
  model the harness routes through an aggregator. Reviews the configured models,
  reads each one's pareto frontier and fallback layers, and recommends a provider
  pool per model. Use when asked which provider is cheapest, whether a discount
  is worth taking, or how to cut model cost.
---

# Provider optimization

> **Currently OpenRouter only.** The per-upstream mechanism — price, precision
> and uptime differing between hosts for one model — is OpenRouter's today, and
> so is the script behind this. A second aggregator would mean a new fetch and a
> second pool/ban block, not a rewrite of the reading rules below. Roles on a
> first-party provider (`anthropic/…`, `deepseek/…`) are outside the script; when
> asked to compare one, read that provider's own pricing page on the day.

One model on OpenRouter is served by many upstreams, each with its own price,
precision (fp4/fp8/…), and uptime. This skill answers: **which upstream set
should each configured model route to today?** Prices move; nothing in this
skill states one. Every price comes from the run, or from a source read the same
day and cited.

It is **model-agnostic**. The models are not named here — they are whatever
`modelRoles` in `config.yml` currently points at OpenRouter. When the harness
switches models, this skill follows without editing. Only `openrouter/*` roles
are in scope.

## When

- "which provider is cheapest", "is that discount worth it", "cut model cost"
- a review of what the harness is spending on inference
- before changing `providers.openrouter` routing in `models.yml`

**Not for:** first-party provider pricing, or the OpenInference ban — the ban is
a correctness fix, not a cost one, and it lives permanently in `models.yml`.

## Run

```bash
# Every distinct OpenRouter model in config.yml — the default job.
bun ~/.omp/agent/scripts/openrouter-sales.ts --configured

bun ~/.omp/agent/scripts/openrouter-sales.ts --configured --html   # HTML per model
bun ~/.omp/agent/scripts/openrouter-sales.ts --configured --json   # machine output
bun ~/.omp/agent/scripts/openrouter-sales.ts                       # first configured model, full table
bun ~/.omp/agent/scripts/openrouter-sales.ts <author>/<slug>       # one model, full table
#   --mix-days N  measurement window (default 7)   --mix c,i,o  override the mix
#   --billed N    generations sampled per model (default 300; 0 = off)
```

Router or non-chat models (no endpoints) are reported as `skipped`, not failed.
A fetch error still fails the run.

The script reads `modelRoles` itself — never hardcode a model into this skill,
and never assume the current one is the model that was current last month.
HTML reports land in `~/.omp/agent/reports/`; give the user the file links.

Every run also appends one row per endpoint to
`~/.omp/agent/reports/openrouter-uptime.jsonl` — see below.

## How to read it

**One recommendation per model.** Do not blend models together: each has its own
upstream set at its own prices, and the pool you write is per model. Present them
separately, and name which roles each model serves (the `roles` line) so the
cost impact is legible — a pool on `default`/`task` moves far more spend than one
on `vision`.

**Blended cost, not a single column.** The ranking weights each price column by
a token mix and never uses the `discount` field. The mix is **measured** per
model from the session logs over the window and printed on the `mix` line with
its source. A line reading `UNMEASURED` means no recorded usage: the ranking is
a guess, so say so, and either pass `--mix` from a comparable model or lean on
the uptime history. Never answer "is this sale worth it" from discount order.

**List price is not billed cost.** The `billed` block samples recent turns of the
model, asks OpenRouter which upstream served each and what it billed, and shows
per upstream: turns, cold turns (nothing read from cache), cache-hit rate and
billed $/Mtok. An upstream whose prompt cache misses re-bills the whole context
as uncached input on every cold turn — invisible in list prices, and on a
cache-heavy workload the largest cost there is. **Read the billed block before
the frontier**: drop a member that bills well above the other measured members
with enough turns to trust, and say which, by how much (as a ratio), and on how
many turns. Members with few or no sampled turns are unmeasured, not good.

**Traffic follows price.** Inside `only`, OpenRouter picks among stable members
weighted by the inverse square of price
([provider routing docs](https://openrouter.ai/docs/guides/routing/provider-selection)),
so the cheapest member carries the most turns — the billed block shows the
split. A cheap member with a poor billed rate is therefore never a quiet
fallback; it is where most of the spend goes. Leave it out rather than "keep it
as a fallback".

**Service tiers are not in the default route.** `flex` and `priority` endpoints
are only eligible under the `:floor` / `:nitro` variants, so the script drops
them before ranking and says which.

**The layers are the answer, not the frontier alone.** The report peels the
frontier repeatedly: **L1** is the frontier (nothing beats it on cost, precision
*and* uptime at once); **L2** is the frontier of what remains, and so on.
Everything below L1 is strictly dominated by something — but dominated is not
useless, because uptime drifts run to run. When an L1 member drops below the
uptime threshold the layers shift, and the L2 members are exactly what gets
promoted. **So L2+ is the fallback set, and pinning L1 alone leaves routing with
no second choice.**

Recommend in prose: the L1 members and the trade between them, then the pool. Do
not emit a score; there are no weights and inventing them hides the tradeoff. If
L1 is a single row, say so and lean on the fallback layers.

**Quote the cost stats.** n / min / avg / max / max-min for the pool, taken over
every endpoint the pool's slugs admit (a slug admits all its service tiers). A
pool whose max is 8× its min holds a different cost regime, not a peer.

**Speed is out of scope.** The script ranks cost, precision and uptime only. It
cannot rank by throughput or latency: the public API returns both as `null` on
every endpoint, and the per-provider stats endpoint is auth-gated behind a
browser session (SOLO-196). Do not claim the report weighs speed, and do not
propose a throughput pool — it is a backlog item, not part of this standard. If a
user asks for speed-based routing now, the answer is OpenRouter's own
`provider.sort: "throughput"` (or the `:nitro` slug suffix) on the same member
set, which delegates the ranking to OpenRouter's router.

## Heuristics

- **Cost alone is not value.** A 60%-cheaper fp4 that fumbles tool calls is
  worthless. Precision is the cheapest available proxy for that quality.
- **fp4 vs fp8 is an open question, not a settled one.** State the cost ratio and
  say the report cannot prove fp8 tool-calls better on this model. Do not assert
  fp4 is worse.
- **Uptime below the warn threshold disqualifies.** A retry costs more than the
  discount saves. The report excludes these automatically — on the 30-minute
  window, so check the uptime log before reading one exclusion as a fact about
  the upstream.
- **Unstated precision is a data gap, not a quality fact.** Say so rather than
  quietly ranking those upstreams last.

## The uptime log

Prices and uptime both move between runs, and uptime is the whole reason the
pool is drawn from the fallback layers rather than the frontier
alone. A snapshot cannot show that movement: every run sees only the current
30m/1d window, so a chronically flaky upstream and one bad 30 minutes look
identical. So each run appends one row per endpoint to
`~/.omp/agent/reports/openrouter-uptime.jsonl`:

```json
{"ts":"…","model":"…","endpoint":"<provider>/<quant>","provider":"…","name":"…",
 "quant":"…","uptime30":…,"uptime1d":…,"blended":…,"layer":…,
 "banned":false,"degraded":false}
```

It is **append-only observed history** — nothing rewrites it, and it is the one
file under `reports/` that is backed up (the rendered HTML beside it is
regenerable). `layer` is recomputed from the eligible set, which does not depend
on `only`, so rows stay comparable across runs even after the pool changes.

Read it before promoting or demoting a member: a single low `uptime30` is a bad
half-hour, the same member low across many runs is a bad upstream. Prefer
`uptime1d` for the judgement — the 30-minute window is the noisiest column the
API offers, and it is the only one the `degraded` flag and the frontier
comparator use, so a member can be excluded from a run on one bad window.

## Applying a result

`provider.only` gives OpenRouter a pool; **it still picks one upstream per
request**, so this is not a per-request split between cheap and precise. The
report builds the pool from the layers — L1 first, then L2+, capped at 5 members
and skipping anything priced beyond 3× the cheapest (a fallback that costs 8×
turns an outage into a bill).

**The pool is per model.** `only` goes under the model's own entry in
`providers.openrouter.modelOverrides.<author>/<slug>.compat`; only the ban stays
provider-level. omp deep-merges provider `compat` into each bundled model, then
deep-merges the model override's `compat` on top (`mergeCompat` in
`config/model-patch.ts`, folded in by `#loadBuiltInModels` →
`#applyModelOverrides`), so both apply and the model-level `only` is *additive*
to the provider-level `ignore`.

```yaml
providers:
  openrouter:
    compat:
      openRouterRouting:
        ignore: [OpenInference]   # keep — correctness, not cost
    modelOverrides:
      <author>/<slug>:
        compat:
          openRouterRouting:
            only: [<pool for this model>]
```

Why per model and not provider-level: the pool is a property of the **model's**
endpoint set, not of OpenRouter. A provider-level `only` built for one model
silently restricts every other one — on 2026-10-12 a deepseek-built list stripped
`novita`/`gmicloud` from `z-ai/glm-5.3-flash`, two of its own pool members.
Never write a provider-level `only` while more than one model routes
through the block.

Members are written as provider slugs — the endpoints-API `tag` prefix
(`inference-net/fp8` → `inference-net`). **Deriving a slug from a display name is
wrong** wherever the two differ: `InferenceNet` slugifies to `inferencenet`, not
`inference-net`, which is how a false "pool drifted" reading happened on
2026-10-12. Take slugs from the report, never by hand.

**Verify before committing.** A bad `only` returns 404 *"All providers have been
ignored"* on every request, and so does `only` + `ignore` of the same host. Send
one tiny request per model with the final pools in place and confirm a `provider`
comes back. To prove the pools are genuinely *per model* and not one shared set,
temporarily give two models disjoint single-member pools, request both, and
confirm each is served by a member of its own pool — a shared pool cannot do
that. A third request with `only: [OpenInference]` must 404 "ignored", proving
the provider-level `ignore` and the model-level `only` reach the request
together. Restore the real pools and re-confirm 200 afterwards.

The upstream that actually served a request is not in omp's output; read it from
OpenRouter's own API — `GET https://openrouter.ai/api/v1/generation?id=<responseId>`
returns `provider_name` (needs `Authorization: Bearer $OPENROUTER_API_KEY`), where
`<responseId>` is the `responseId` field of the `--mode json` turn output.

## Done when

- **Every configured OpenRouter model** has a recommendation — none skipped, and
  the count matches `modelRoles`.
- For each: the L1 members, the cost/precision trade as a ratio, the fallback
  layers, and the pool with its cost spread.
- The caveats that apply are named (no speed data; fp4 unproven; `only` is a pool
  not a split).
- Any config change is shown as YAML with the ban preserved, and the pool was
  verified by a real request before being written.
