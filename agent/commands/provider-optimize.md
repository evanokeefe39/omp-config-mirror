---
description: Optimise model provider routing to cut cost without wrecking quality — review every configured OpenRouter model, read each one's pareto frontier and fallback layers, and recommend a provider pool per model. Use when asked which provider is cheapest, whether a discount is worth taking, or how to cut model cost.
---

# provider-optimize

Reviews the models the harness routes through OpenRouter and recommends a
provider pool for each. Read `skill://provider-optimize` first — it owns the
reading rules, the heuristics and the caveats.

**OpenRouter only, for now.** The script does not fetch first-party pricing; if
asked to compare a first-party provider, read its own pricing page that day and
cite it. A second aggregator would need its own fetch.

## Runbook

1. **Run the review.** It reads `modelRoles` itself — no model is named here.
   ```bash
   bun ~/.omp/agent/scripts/openrouter-sales.ts --configured        # every configured model
   bun ~/.omp/agent/scripts/openrouter-sales.ts --configured --html # HTML per model
   bun ~/.omp/agent/scripts/openrouter-sales.ts <author>/<slug>     # one model, full table
   ```

2. **One recommendation per model.** Do not blend models together — each has its
   own upstream set at its own prices. Name the roles each model serves so the
   cost impact is legible (`default`/`task` move far more spend than `vision`).

3. **Read the `mix` and `billed` lines first.** The mix must say `measured`; an
   `UNMEASURED` mix makes the ranking a guess — say so. The billed block is what
   each upstream actually cost per token on our traffic, cache misses included;
   drop a member that bills well above the other measured members, quoting the
   ratio and turn count. Members with few sampled turns are unmeasured, not good.

4. **Read the layers, not just the frontier.** L1 is the primary choice set; L2+
   are the fallbacks promoted when an L1 member degrades. Uptime drifts, so L2+
   is not dead weight — say why it matters. Each run also appends per-endpoint
   uptime to `~/.omp/agent/reports/openrouter-uptime.jsonl`, which is the only
   way to tell chronic flakiness from one bad window; read it before promoting or
   demoting a member.

5. **Quote the cost stats.** n / min / avg / max / max-min for the pool. A pool
   whose max is 8× its min holds a different cost regime, not a peer.

6. **Deliver:** the report paths, each model's L1 members with the cost/precision
   trade as a ratio, its fallback layers, and the caveats that apply.

## Rules

- **Never rank by throughput or latency.** The public API returns both as `null`;
  the per-provider stats endpoint is auth-gated (SOLO-196). Do not propose a
  throughput pool. For speed-based routing the answer is OpenRouter's own
  `provider.sort: "throughput"` on the same member set.
- **Never edit cost cards to chase a discount** — omp applies one flat card per
  model id while OpenRouter prices per upstream.
- **Keep `ignore: [OpenInference]`** — it is correctness, not cost, and it stays at
  provider level while `only` goes per model.
- **Slugs come from the report**, never derived by hand from a display name
  (`InferenceNet` slugifies wrongly). A bad `only` makes every request fail with
  404 "All providers have been ignored".
- **`only` is written per model** — `providers.openrouter.modelOverrides.<id>.compat`.
  A provider-level `only` applies to every OpenRouter model, so a list built for
  one silently restricts the others; omp deep-merges the two, so the per-model
  key is additive to the provider-level ban.
- **Recommend in prose.** No score, no weights — inventing them hides the tradeoff.
