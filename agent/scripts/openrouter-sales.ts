#!/usr/bin/env bun
/**
 * OpenRouter daily provider-sales report.
 *
 * WHY: OpenRouter serves one model from many upstreams, each with its own
 * price, and some run temporary discounts. modelRoles pins
 * openrouter/deepseek/deepseek-v4.1-flash, so the upstream actually chosen at
 * request time varies and so does the real cost. This script fetches the live
 * per-upstream pricing and ranks it.
 *
 * CRITICAL: rank by a blended cost on this harness's MEASURED token mix, never
 * by the `discount` field, and never by a single price column. The mix is read
 * per model from the session logs (see measureUsage), because a guessed mix
 * reorders the whole table: on 2026-10-17 the old constant weighted output ~19x
 * higher than measured use and put a cache-expensive upstream on the frontier.
 *
 * List price is not billed cost. An upstream whose prompt cache misses bills
 * cache-miss input on every cold turn, which list prices cannot show. With
 * OPENROUTER_API_KEY set, the script samples recent generations of each model
 * from the session logs and reads what OpenRouter actually billed, per upstream
 * (see billedSample).
 *
 * Ranking policy: quantization tier first, blended cost within a tier. A
 * tool-calling agent is worthless on an upstream that fumbles tool calls, and
 * precision is the cheapest available proxy for that quality. So a pricier fp8
 * deliberately outranks a much-cheaper fp4. See compareProviders().
 *
 * Usage:
 *   bun agent/scripts/openrouter-sales.ts --configured    # every distinct
 *                                                         # OpenRouter model in
 *                                                         # config.yml modelRoles
 *   bun agent/scripts/openrouter-sales.ts                 # first configured model
 *   bun agent/scripts/openrouter-sales.ts <author>/<slug>  # one model
 *   bun agent/scripts/openrouter-sales.ts --configured --json
 *   bun agent/scripts/openrouter-sales.ts --configured --html
 *   --mix-days N        measurement window for mix and billed sample (default 7)
 *   --mix c,i,o         override the measured mix (cache-read, input, output)
 *   --billed N          generations to sample per model (default 300, 0 = off)
 *
 * No model is hardcoded: the configured set is read from `modelRoles`, and only
 * `openrouter/*` roles are reviewed (first-party providers have no per-upstream
 * routing to choose between).
 *
 * Run by hand. Do not schedule this until it has produced useful output across
 * several days (see AGENTS.md "Only proven technology").
 *
 * Data source: https://openrouter.ai/api/v1/models/{author}/{slug}/endpoints
 * Public, no auth. Verified 2026-10-12.
 */

import { appendFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Token mix: shares of total tokens (cache-read, uncached input, output). */
interface Mix {
  cacheRead: number;
  input: number;
  output: number;
}

/**
 * Fallback mix, used ONLY for a model with no recorded usage in the window (a
 * newly configured model). Every report that uses it says so on its mix line.
 */
const UNMEASURED_MIX: Mix = { cacheRead: 0.8, input: 0.05, output: 0.15 };

/** The mix in force for the model being rendered; set per model by useMix(). */
let MIX: Mix = UNMEASURED_MIX;
let MIX_SOURCE = "unmeasured fallback";

function mixLine(): string {
  return `cache ${MIX.cacheRead.toFixed(3)} / in ${MIX.input.toFixed(3)} / out ${MIX.output.toFixed(3)} (${MIX_SOURCE})`;
}

const UPTIME_WARN_PCT = 99;

const BANNED = ["OpenInference"] as const;

/**
 * Rank order: precision tier gates, cost orders within a tier.
 *
 * Rationale (2026-10-12): this is a tool-calling agent, so an upstream that
 * fumbles tool calls is worthless at any price - the OpenInference ban is the
 * same lesson. Precision is the cheapest available proxy for that quality, so
 * it gates first; among equally-precise upstreams the cheaper one wins.
 *
 * fp32 and fp16 deliberately sit in the SAME tier as fp8. Ranking them above
 * it promoted BaseTen/fp32 to #1 at $0.4012 - 8.7x the cheapest endpoint -
 * on precision alone, which is not the trade anyone wants. Half a float vs a
 * single float is not a quality cliff for this workload; fp4 is. So the tiers
 * express "at least fp8" vs "fp4" vs "unstated", not a full precision ladder.
 *
 * Consequence, accepted deliberately: a much-cheaper fp4 (Decart, $0.0459)
 * ranks BELOW pricier fp8 (DeepInfra, $0.0734). Paying ~60% more for fp8 is
 * the trade this policy makes. Unknown counts as its own lowest tier, so an
 * unlabelled endpoint never outranks a measured one.
 */
const QUANT_RANK: Record<string, number> = {
  fp32: 2,
  fp16: 2,
  bf16: 2,
  fp8: 2,
  int8: 2,
  fp4: 1,
  int4: 1,
  unknown: 0,
  "": 0,
};

interface Endpoint {
  provider_name: string;
  tag: string;
  quantization: string;
  status: number;
  uptime_last_30m: number | null;
  uptime_last_1d: number | null;
  latency_last_30m: number | null;
  throughput_last_30m: number | null;
  supports_implicit_caching: boolean;
  /** `flex` / `priority`: only routable under the `:floor` / `:nitro` variants. */
  service_tier?: string | null;
  pricing: {
    prompt: string;
    completion: string;
    input_cache_read?: string;
    discount: number | string;
  };
}

interface Report {
  name: string;
  tag: string;
  quant: string;
  quantRank: number;
  /** Pareto layer: 1 is the frontier, 2 the frontier of the remainder, etc. */
  layer: number;
  inPerM: number;
  cachePerM: number;
  outPerM: number;
  discount: number;
  blended: number;
  uptime30: number | null;
  uptime1d: number | null;
  latency: number | null;
  tps: number | null;
  banned: boolean;
  degraded: boolean;
  naiveCacheRead: number;
  /** The endpoint lists no cache-read price; cache tokens priced at the prompt rate. */
  cacheAssumed: boolean;
}

function perMillion(tokenPrice: string | undefined): number {
  if (tokenPrice == null) return NaN;
  const n = Number(tokenPrice);
  return Number.isFinite(n) ? n * 1e6 : NaN;
}

/** An empty `endpoints` list is a router or non-chat model: nothing to route. */
async function fetchEndpoints(slug: string): Promise<{ id: string; name: string; endpoints: Endpoint[] }> {
  const url = `https://openrouter.ai/api/v1/models/${slug}/endpoints`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`GET ${url} -> HTTP ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { data?: { id: string; name: string; endpoints?: Endpoint[] } };
  if (!body.data || !Array.isArray(body.data.endpoints)) {
    throw new Error(`malformed response for ${slug}: no data.endpoints array`);
  }
  return { id: body.data.id, name: body.data.name, endpoints: body.data.endpoints };
}

// --- measured usage ----------------------------------------------------------

const SESSIONS_DIR = process.env.OMP_SESSIONS_DIR ?? join(homedir(), ".omp", "agent", "sessions");

interface Turn {
  id: string;
  input: number;
  cacheRead: number;
  output: number;
}

interface Usage {
  turns: Turn[];
  input: number;
  cacheRead: number;
  output: number;
}

/**
 * Per-model OpenRouter usage from the session logs over the last `days`: one
 * pass over every session file modified in the window, keeping assistant turns
 * with non-zero usage (errored turns carry zeros and would dilute the mix).
 * Cache-write tokens are counted as input: they bill as prompt tokens on the
 * upstreams this harness uses.
 */
async function measureUsage(days: number): Promise<Map<string, Usage>> {
  const since = Date.now() - days * 864e5;
  const out = new Map<string, Usage>();
  let names: string[];
  try {
    names = (await readdir(SESSIONS_DIR, { recursive: true })) as string[];
  } catch (err) {
    throw new Error(`cannot read session logs at ${SESSIONS_DIR}: ${(err as Error).message}`);
  }
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    const path = join(SESSIONS_DIR, name);
    if ((await stat(path)).mtimeMs < since) continue;
    for (const line of (await readFile(path, "utf8")).split("\n")) {
      if (!line.includes('"usage"') || !line.includes('"openrouter"')) continue;
      let o: { timestamp?: string; message?: Record<string, any> };
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      const m = o.message;
      if (m?.role !== "assistant" || m.provider !== "openrouter" || !m.usage) continue;
      if (o.timestamp && Date.parse(o.timestamp) < since) continue;
      const u = m.usage;
      const input = (u.input ?? 0) + (u.cacheWrite ?? 0);
      const cacheRead = u.cacheRead ?? 0;
      const output = u.output ?? 0;
      if (!input && !cacheRead && !output) continue;
      const acc = out.get(m.model) ?? { turns: [], input: 0, cacheRead: 0, output: 0 };
      acc.input += input;
      acc.cacheRead += cacheRead;
      acc.output += output;
      if (m.responseId) acc.turns.push({ id: m.responseId, input, cacheRead, output });
      out.set(m.model, acc);
    }
  }
  return out;
}

function useMix(modelId: string, usage: Map<string, Usage> | null, override: Mix | null, days: number): void {
  if (override) {
    MIX = override;
    MIX_SOURCE = "--mix override";
    return;
  }
  const u = usage?.get(modelId);
  const total = u ? u.input + u.cacheRead + u.output : 0;
  if (!u || !total) {
    MIX = UNMEASURED_MIX;
    MIX_SOURCE = `UNMEASURED - no usage for ${modelId} in ${days}d; fallback constant, ranking is a guess`;
    return;
  }
  MIX = { cacheRead: u.cacheRead / total, input: u.input / total, output: u.output / total };
  MIX_SOURCE = `measured: ${u.turns.length} turns, ${(total / 1e6).toFixed(1)} Mtok, ${days}d`;
}

/**
 * What OpenRouter actually billed, per upstream, for a random sample of this
 * model's recent turns. Each turn's responseId resolves through
 * GET /api/v1/generation to the upstream that served it and its billed cost;
 * tokens come from the session log. A "cold" turn read nothing from cache.
 *
 * WHY: a list price assumes the upstream's prompt cache hits. On 2026-10-17 one
 * pool member served 36% of sampled tokens at a 73.5% cache-hit rate and cost
 * 2-6x per token what the other members billed - invisible in list prices.
 */
async function billedSample(u: Usage | undefined, n: number, days: number, rows: Report[]): Promise<string[]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return ["   billed     : SKIPPED - OPENROUTER_API_KEY not set; list prices only"];
  if (!u?.turns.length) return [`   billed     : SKIPPED - no recorded turns in ${days}d`];
  const sample = [...u.turns].sort(() => Math.random() - 0.5).slice(0, n);
  const agg = new Map<string, { turns: number; cold: number; input: number; cacheRead: number; output: number; cost: number }>();
  let failed = 0;
  for (let i = 0; i < sample.length; i += 15) {
    await Promise.all(
      sample.slice(i, i + 15).map(async (t) => {
        const res = await fetch(`https://openrouter.ai/api/v1/generation?id=${t.id}`, {
          headers: { Authorization: `Bearer ${key}` },
        }).catch(() => null);
        const body: unknown = res?.ok ? await res.json().catch(() => null) : null;
        const d = body && typeof body === "object" && "data" in body ? body.data : null;
        const provider = d && typeof d === "object" && "provider_name" in d ? d.provider_name : null;
        const cost = d && typeof d === "object" && "total_cost" in d ? d.total_cost : null;
        if (typeof provider !== "string" || typeof cost !== "number") {
          failed++;
          return;
        }
        const a = agg.get(provider) ?? { turns: 0, cold: 0, input: 0, cacheRead: 0, output: 0, cost: 0 };
        a.turns++;
        if (!t.cacheRead) a.cold++;
        a.input += t.input;
        a.cacheRead += t.cacheRead;
        a.output += t.output;
        a.cost += cost;
        agg.set(provider, a);
      }),
    );
  }
  const slugByName = new Map(rows.map((r) => [r.name, slugOf(r)]));
  const out = [
    `   billed     : ${sample.length - failed} of ${u.turns.length} turns (${days}d) priced by OpenRouter /generation` +
      (failed ? `; ${failed} lookups FAILED` : ""),
    `                ${pad("upstream (slug)", 34)}turns  cold   hit%   $/Mtok billed`,
  ];
  const ranked = [...agg].map(([name, a]) => ({ name, ...a, tok: a.input + a.cacheRead + a.output }));
  ranked.sort((x, y) => x.cost / x.tok - y.cost / y.tok);
  for (const a of ranked) {
    const hit = (100 * a.cacheRead) / (a.cacheRead + a.input || 1);
    out.push(
      `                ${pad(`${a.name} (${slugByName.get(a.name) ?? "?"})`, 34)}${String(a.turns).padStart(5)} ${String(a.cold).padStart(5)} ${hit.toFixed(1).padStart(6)}   ${fmt((a.cost / a.tok) * 1e6)}`,
    );
  }
  if (failed === sample.length) out.push("                every lookup failed - check the key and its limit");
  return out;
}

function build(ep: Endpoint): Report {
  const inPerM = perMillion(ep.pricing.prompt);
  const listedCache = perMillion(ep.pricing.input_cache_read);
  // No cache-read price listed: assume cache tokens bill at the prompt rate.
  // Leaving it NaN made the endpoint undominatable and poisoned every stat.
  const cacheAssumed = !Number.isFinite(listedCache);
  const cachePerM = cacheAssumed ? inPerM : listedCache;
  const outPerM = perMillion(ep.pricing.completion);
  const blended = MIX.input * inPerM + MIX.cacheRead * cachePerM + MIX.output * outPerM;
  const provider = ep.provider_name ?? "";
  const quant = ep.quantization ?? "";
  const uptime30 = ep.uptime_last_30m;
  return {
    name: provider,
    tag: ep.tag ?? "",
    quant,
    quantRank: QUANT_RANK[quant.toLowerCase()] ?? 0,
    layer: 0,
    inPerM,
    cachePerM,
    outPerM,
    discount: Number(ep.pricing.discount) || 0,
    blended,
    uptime30,
    uptime1d: ep.uptime_last_1d,
    latency: ep.latency_last_30m,
    tps: ep.throughput_last_30m,
    banned: BANNED.some((b) => provider.toLowerCase().includes(b.toLowerCase())),
    degraded: ep.status < 0 || (uptime30 ?? 100) < UPTIME_WARN_PCT,
    naiveCacheRead: cachePerM,
    cacheAssumed,
  };
}

function fmt(n: number, digits = 4): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "-";
}

function pad(s: string, w: number): string {
  const t = s.length > w ? s.slice(0, w - 1) + "\u2026" : s;
  return t.padEnd(w);
}

const HEADER =
  pad("provider", 22) +
  pad("blended$/M", 11) +
  pad("cache$/M", 10) +
  pad("out$/M", 9) +
  pad("in$/M", 9) +
  pad("disc", 6) +
  pad("up30", 8) +
  pad("up1d", 8);
const RULE = "-".repeat(83);

function row(r: Report): string {
  return (
    pad(`${r.name} [${r.quant}]`, 22) +
    pad(fmt(r.blended), 11) +
    pad(fmt(r.cachePerM), 10) +
    pad(fmt(r.outPerM), 9) +
    pad(fmt(r.inPerM), 9) +
    pad(r.discount ? `${Math.round(r.discount * 100)}%` : "-", 6) +
    pad(r.uptime30 == null ? "-" : `${r.uptime30.toFixed(1)}%`, 8) +
    pad(r.uptime1d == null ? "-" : `${r.uptime1d.toFixed(1)}%`, 8)
  );
}

/**
 * Group key for the per-precision tables. fp16/fp32/bf16/int8 collapse to
 * "fp8+" because, as in compareProviders, half a float vs a single float is
 * not a quality cliff here - fp4 is. Keeping one row per raw label would
 * scatter near-identical endpoints across tables nobody compares.
 */
function groupKey(r: Report): string {
  return r.quantRank >= 2 ? "fp8+" : r.quantRank === 1 ? "fp4" : "unstated";
}

/**
 * A row is dominated when another row is at least as good on every axis and
 * strictly better on one. Axes: lower blended cost, higher precision tier,
 * higher uptime. Uptime is null-safe - an unknown uptime never counts as
 * better than a known one, so it cannot dominate or be dominated on that axis
 * alone.
 */
function dominates(a: Report, b: Report): boolean {
  const costOk = a.blended <= b.blended;
  const precOk = a.quantRank >= b.quantRank;
  const aUp = a.uptime30 ?? -1;
  const bUp = b.uptime30 ?? -1;
  const upOk = aUp >= bUp;
  const strictlyBetter = a.blended < b.blended || a.quantRank > b.quantRank || aUp > bUp;
  return costOk && precOk && upOk && strictlyBetter;
}

function frontier(rows: Report[]): Report[] {
  return rows.filter((r) => !rows.some((o) => o !== r && dominates(o, r)));
}

/**
 * Peel the frontier repeatedly: layer 1 is the frontier, layer 2 is the
 * frontier of what remains, and so on.
 *
 * WHY layers instead of one frontier: uptime drifts run to run, so a two-member
 * frontier is brittle - if the cheapest member dips under the uptime threshold
 * the frontier becomes a single provider and routing has nowhere to fall. Later
 * layers are precisely the members promoted when an earlier one degrades, so
 * they are the natural fallback set, and they cost nothing to include: with
 * `only` set, OpenRouter still load-balances by price and only reaches the
 * fallbacks when the cheap ones fail.
 */
function paretoLayers(rows: Report[], maxLayers = 5): { layers: Report[][]; assigned: Map<Report, number> } {
  const remaining = [...rows];
  const layers: Report[][] = [];
  const assigned = new Map<Report, number>();
  while (remaining.length && layers.length < maxLayers) {
    const layer = frontier(remaining);
    if (!layer.length) break;
    layers.push(layer);
    for (const r of layer) {
      assigned.set(r, layers.length);
      remaining.splice(remaining.indexOf(r), 1);
    }
  }
  return { layers, assigned };
}

/**
 * The provider pool to write into `only`: walk the layers cheapest-first and
 * stop at MAX_POOL distinct slugs, skipping anything priced beyond
 * COST_CEILING_MULT of the cheapest member. The ceiling matters because a
 * fallback is only useful if it is affordable when it is used.
 *
 * `only` takes provider slugs, and one slug can serve several endpoints
 * (service tiers, regions). A slug is picked once, by its cheapest qualifying
 * endpoint; admitted() then reports every endpoint the slug lets through.
 */
const MAX_POOL = 5;
const COST_CEILING_MULT = 3;

function pool(layers: Report[][], cheapest: number): Report[] {
  const out: Report[] = [];
  const slugs = new Set<string>();
  for (const layer of layers) {
    for (const r of [...layer].sort((a, b) => a.blended - b.blended)) {
      if (out.length >= MAX_POOL) return out;
      if (r.blended > cheapest * COST_CEILING_MULT || slugs.has(slugOf(r))) continue;
      slugs.add(slugOf(r));
      out.push(r);
    }
  }
  return out;
}

/**
 * Every non-banned endpoint a pool's `only` admits - including pricier tiers of
 * a picked slug and its degraded endpoints, which OpenRouter can still route to.
 * Pool cost stats are taken over this set, so the max is honest.
 */
function admitted(picks: Report[], rows: Report[]): Report[] {
  const slugs = new Set(picks.map(slugOf));
  return rows.filter((r) => !r.banned && slugs.has(slugOf(r)));
}

interface CostStats {
  n: number;
  min: number;
  avg: number;
  max: number;
  spread: number;
}

function costStats(rows: Report[]): CostStats | null {
  if (!rows.length) return null;
  const vals = rows.map((r) => r.blended);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return { n: vals.length, min, avg: vals.reduce((a, b) => a + b, 0) / vals.length, max, spread: min > 0 ? max / min : Infinity };
}

function render(modelId: string, modelName: string, rows: Report[]): string {
  const eligible = rows.filter((r) => !r.banned && !r.degraded);
  eligible.sort(compareProviders);
  const { layers, assigned } = paretoLayers(eligible);
  const layersOf = (r: Report) => assigned.get(r) ?? 0;

  const lines: string[] = [];
  lines.push(`# OpenRouter provider sales - ${modelId}`);
  lines.push(`# ${modelName}`);
  lines.push(`# mix: ${mixLine()}`);
  lines.push(`# banned: ${BANNED.join(", ")}`);
  lines.push("");

  // All eligible upstreams, grouped by precision. L1 is the frontier; L2+ are
  // the layers that get promoted when an earlier one degrades, which is what
  // makes them the fallback set rather than dead weight.
  lines.push(`## all eligible (${eligible.length}) - L1 = pareto frontier, L2+ = fallback layers`);
  lines.push(HEADER + "  layer");
  lines.push(RULE + "------");
  for (const key of ["fp8+", "fp4", "unstated"]) {
    const members = eligible.filter((r) => groupKey(r) === key);
    if (!members.length) continue;
    const labels = members.map((r) => r.quant).filter((q, i, a) => a.indexOf(q) === i);
    lines.push(`-- ${key} (${labels.join(", ")}) - ${members.length}`);
    for (const r of members) {
      const l = layersOf(r);
      lines.push(row(r) + (l ? `  L${l}${l === 1 ? "  <-- FRONTIER" : ""}` : ""));
    }
  }
  lines.push("");

  const excluded = rows.filter((r) => r.banned || r.degraded);
  if (excluded.length) {
    lines.push("excluded:");
    for (const r of excluded) {
      const why = [r.banned ? "BANNED" : null, r.degraded ? "degraded" : null]
        .filter(Boolean)
        .join("+");
      lines.push(
        `  ${pad(`${r.name} [${r.quant}]`, 22)}${why.padEnd(10)} blend ${fmt(r.blended)}  cache ${fmt(r.cachePerM)}  out ${fmt(r.outPerM)}`,
      );
    }
    lines.push("");
  }

  lines.push(renderVerdict(modelId, layers, eligible, rows));

  return lines.join("\n");
}

/**
 * Display order within the table: precision tier first, cost within a tier.
 * This is read order only - the frontier is what marks which rows matter, and
 * it ignores this order. A cheaper tier sorts below a more precise one because
 * reading fp4 interleaved among fp8 obscures the trade.
 */
function compareProviders(a: Report, b: Report): number {
  if (a.quantRank !== b.quantRank) return b.quantRank - a.quantRank;
  return a.blended - b.blended;
}

function renderVerdict(modelId: string, layers: Report[][], eligible: Report[], all: Report[]): string {
  const out: string[] = [];
  if (!eligible.length) return "No eligible upstreams - every endpoint is banned or degraded.";

  const front = layers[0] ?? [];
  const cheapest = Math.min(...eligible.map((r) => r.blended));

  out.push(`## pareto frontier (L1: ${front.length} of ${eligible.length})`);
  out.push("   not dominated on cost + precision + uptime; the primary choice set.");
  for (const r of [...front].sort((a, b) => a.blended - b.blended)) {
    out.push(
      `  ${pad(`${r.name} [${r.quant}]`, 24)}${fmt(r.blended)} $/M  up30 ${
        r.uptime30 == null ? "unknown" : `${r.uptime30.toFixed(1)}%`
      }`,
    );
  }

  // Fallback layers. These matter because uptime drifts: when an L1 member
  // drops below the threshold the layers shift, and the members named here are
  // what gets promoted. Pinning only L1 leaves routing with no second choice.
  const fallbackLayers = layers.slice(1).filter((l) => l.length);
  if (fallbackLayers.length) {
    out.push("");
    out.push("## fallback layers (promoted when an earlier layer degrades)");
    fallbackLayers.forEach((l, i) => {
      const members = [...l]
        .sort((a, b) => a.blended - b.blended)
        .map((r) => `${r.name} [${r.quant}] ${fmt(r.blended)}`);
      out.push(`  L${i + 2}  ${members.join("  |  ")}`);
    });
  }

  // Cost statistics over the eligible set and over the chosen pool, so a
  // recommendation carries its own spread: a pool whose max is 8x its min is
  // one where the fallback is a different cost regime, not a peer.
  const allStats = costStats(eligible);
  const poolPicks = pool(layers, cheapest);
  const picksStats = costStats(admitted(poolPicks, all));
  if (allStats && picksStats) {
    out.push("");
    out.push("## blended cost ($/M)");
    out.push(`                 n     min     avg     max    max/min`);
    out.push(
      `  eligible   ${String(allStats.n).padStart(4)}  ${fmt(allStats.min).padStart(7)} ${fmt(allStats.avg).padStart(7)} ${fmt(allStats.max).padStart(7)}  ${allStats.spread.toFixed(1).padStart(7)}x`,
    );
    out.push(
      `  pool*      ${String(picksStats.n).padStart(4)}  ${fmt(picksStats.min).padStart(7)} ${fmt(picksStats.avg).padStart(7)} ${fmt(picksStats.max).padStart(7)}  ${picksStats.spread.toFixed(1).padStart(7)}x`,
    );
    out.push(
      `  L1 only    ${String(front.length).padStart(4)}  ${fmt(costStats(front)!.min).padStart(7)} ${fmt(costStats(front)!.avg).padStart(7)} ${fmt(costStats(front)!.max).padStart(7)}  ${costStats(front)!.spread.toFixed(1).padStart(7)}x`,
    );
    out.push("  * pool = every endpoint the pool's slugs admit, incl. pricier tiers and degraded endpoints");
  }
  const assumed = all.filter((r) => r.cacheAssumed && !r.banned);
  if (assumed.length) {
    out.push("");
    out.push(
      `note: no cache-read price listed for ${assumed.map((r) => r.tag).join(", ")}; cache tokens priced at its prompt rate.`,
    );
  }

  const bestFp8 = front.find((r) => groupKey(r) === "fp8+");
  const bestFp4 = front.find((r) => groupKey(r) === "fp4");
  if (bestFp8 && bestFp4 && bestFp4.blended > 0) {
    const premium = bestFp8.blended / bestFp4.blended;
    out.push("");
    out.push(
      `fp4 vs fp8 trade on the frontier: ${bestFp4.name} (fp4) ${fmt(bestFp4.blended)} vs ` +
        `${bestFp8.name} (fp8) ${fmt(bestFp8.blended)} = ${premium.toFixed(2)}x.`,
    );
    out.push(
      `  Both survive, so the frontier does NOT resolve this for you: it says paying ${premium.toFixed(2)}x ` +
        `for fp8 is a live option, not that it is correct. No endpoint here proves fp8 tool-calls better.`,
    );
  }

  // Uptime under the warn threshold is a routing risk, not a price signal: a
  // cheap upstream that drops one request in fifty costs more in retries than
  // the discount saves.
  const flaky = all
    .filter((r) => !r.banned && (r.uptime30 ?? 100) < UPTIME_WARN_PCT)
    .sort((a, b) => (a.uptime30 ?? 100) - (b.uptime30 ?? 100));
  if (flaky.length) {
    out.push("");
    out.push(`\u26a0 uptime below ${UPTIME_WARN_PCT}% on the 30-minute window (excluded from ranking):`);
    for (const r of flaky) {
      const dash = r.uptime30 == null ? "unknown" : `${r.uptime30.toFixed(2)}%`;
      out.push(`  ${r.name} [${r.quant}]  30m ${dash}  1d ${r.uptime1d == null ? "unknown" : `${r.uptime1d.toFixed(2)}%`}  blend ${fmt(r.blended)}`);
    }
  }

  const noPerf = eligible.every((r) => r.latency == null && r.tps == null);
  if (noPerf) {
    out.push("");
    out.push(
      "note: latency_last_30m / throughput_last_30m are null for every endpoint on this model. " +
        "The API exposes no speed data, so any value score weighting them would weight a constant.",
    );
  }

  // A "group of providers" is expressed as provider.only. OpenRouter still
  // picks ONE endpoint per request from that set, so this selects the pool,
  // not a per-request split. Banned hosts are never listed.
  const picks = pool(layers, cheapest);
  out.push("");
  out.push(`## suggested models.yml routing for this model (frontier + fallbacks, ban respected)`);
  out.push(`# path: providers.openrouter.modelOverrides.${modelId}.compat.openRouterRouting`);
  out.push(`          only: [${picks.map(slugOf).join(", ")}]`);
  out.push("");
  for (const r of picks) {
    const why = (layers[0] ?? []).includes(r) ? "L1 frontier" : `L${(layers.findIndex((l) => l.includes(r)) + 1)} fallback`;
    out.push(`    ${pad(r.name, 16)} [${pad(r.quant, 6)}] ${fmt(r.blended)} $/M   ${why}`);
  }
  out.push("");
  out.push(`  Pool rules: at most ${MAX_POOL} members, nothing above ${COST_CEILING_MULT}x the cheapest`);
  out.push(`  ($${fmt(cheapest * COST_CEILING_MULT)}/M) - a fallback that costs 8x turns an outage into a bill.`);
  out.push(`  OpenRouter still picks ONE per request, price-weighted, so the cheap members serve`);
  out.push(`  normally and the fallbacks are reached only when those fail. Banned hosts excluded.`);
  out.push("");
  out.push(`NOTE: pin with \`only\` rather than by editing cost cards - one flat card`);
  out.push(`cannot price a routed request, and the pinned cost is an estimate either way.`);
  out.push("");
  out.push(`NOTE: \`only\` is per MODEL, not per platform. Writing it at provider level`);
  out.push(`restricts every OpenRouter model to this model's members.`);
  out.push("");
  out.push(`WARNING: the ban stays at provider level and is merged with this \`only\`, so`);
  out.push(`do not drop \`ignore: [${BANNED.join(", ")}]\` from`);
  out.push(`\`providers.openrouter.compat.openRouterRouting\` - see models.yml.`);

  return out.join("\n");
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function renderHtml(modelId: string, modelName: string, rows: Report[], billed: string[] = []): string {
  const eligible = rows.filter((r) => !r.banned && !r.degraded);
  eligible.sort(compareProviders);
  const { layers, assigned } = paretoLayers(eligible);
  const cheapest = Math.min(...eligible.map((r) => r.blended));
  const picks = pool(layers, cheapest);
  const allStats = costStats(eligible);
  const picksStats = costStats(admitted(picks, rows));
  const excluded = rows.filter((r) => r.banned || r.degraded);
  const now = new Date().toISOString().replace("T", " ").slice(0, 16) + "Z";

  const cell = (r: Report): string => {
    const l = assigned.get(r) ?? 0;
    const cls = l === 1 ? "front" : l === 2 ? "fb" : "";
    const badge = l === 1 ? ' <span class="badge">L1 frontier</span>' : l ? ` <span class="badge muted-badge">L${l}</span>` : "";
    return `<tr class="${cls}">
      <td class="pv">${esc(r.name)}${badge}</td>
      <td class="q">${esc(r.quant || "?")}</td>
      <td class="n strong">${fmt(r.blended)}</td>
      <td class="n">${fmt(r.cachePerM)}</td>
      <td class="n">${fmt(r.outPerM)}</td>
      <td class="n">${fmt(r.inPerM)}</td>
      <td class="n">${r.discount ? Math.round(r.discount * 100) + "%" : "-"}</td>
      <td class="n">${r.uptime30 == null ? "-" : r.uptime30.toFixed(1) + "%"}</td>
    </tr>`;
  };

  const groupBlock = (key: string, label: string): string => {
    const members = eligible.filter((r) => groupKey(r) === key);
    if (!members.length) return "";
    return `<h3>${esc(label)} <span class="muted">· ${members.length}</span></h3>
      <table>${HEAD_ROW}${members.map(cell).join("")}</table>`;
  };

  const layerList = (members: Report[]): string =>
    [...members]
      .sort((a, b) => a.blended - b.blended)
      .map(
        (r) =>
          `<li><b>${esc(r.name)}</b> <span class="muted">${esc(r.quant)}</span> — ${fmt(r.blended)} $/M</li>`,
      )
      .join("");

  const frontList = layerList(layers[0] ?? []);
  const fallbackBlock = layers
    .slice(1)
    .filter((l) => l.length)
    .map(
      (l, i) =>
        `<div class="card"><h4>L${i + 2} fallback</h4><ul>${layerList(l)}</ul></div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenRouter provider sales — ${esc(modelId)}</title>
<style>
  :root{--bg:#0f1115;--panel:#171a21;--line:#272b34;--fg:#e6e8ec;--muted:#8b93a3;
        --accent:#7dd3a0;--warn:#e0b341;--front:#1d2b24}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
       font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:2rem}
  h1{font-size:1.25rem;margin:0 0 .25rem}
  h3{font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
     margin:1.5rem 0 .5rem;font-weight:600}
  .sub{color:var(--muted);margin:0 0 1.5rem;font-size:.85rem}
  table{width:100%;border-collapse:collapse;background:var(--panel);
        border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:.5rem}
  th{font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);
     text-align:right;padding:.5rem .6rem;border-bottom:1px solid var(--line);font-weight:600}
  th:first-child{text-align:left}
  td{padding:.45rem .6rem;border-bottom:1px solid rgba(39,43,52,.5);text-align:right;
     font-variant-numeric:tabular-nums}
  td:first-child{text-align:left}
  tr:last-child td{border-bottom:none}
  tr.front{background:var(--front)}
  tr.fb{background:#1b222c}
  .muted-badge{background:#2b3444;color:var(--muted)}
  .strong{font-weight:600;color:var(--accent)}
  .q{color:var(--muted);text-align:center}
  .muted{color:var(--muted);font-weight:400}
  .badge{background:var(--accent);color:#08130d;font-size:.65rem;padding:.1rem .4rem;
         border-radius:4px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:.75rem;margin:1rem 0}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:.85rem 1rem}
  .card h4{margin:0 0 .4rem;font-size:.75rem;text-transform:uppercase;color:var(--muted);
           letter-spacing:.05em}
  .card p{margin:0;font-size:.9rem}
  .warn{color:var(--warn)}
  ul{margin:.4rem 0;padding-left:1.1rem}
  code{background:#0a0c10;padding:.1rem .35rem;border-radius:4px;font-size:.85em}
  .foot{margin-top:2rem;color:var(--muted);font-size:.78rem;border-top:1px solid var(--line);padding-top:.75rem}
</style></head><body>
<h1>OpenRouter provider sales</h1>
<p class="sub">${esc(modelId)} · ${esc(modelName)} · generated ${now}<br>
mix ${esc(mixLine())} · banned: ${esc(BANNED.join(", "))} · uptime warn &lt; ${UPTIME_WARN_PCT}%</p>
${billed.length ? `<pre class="sub">${esc(billed.join("\n"))}</pre>` : ""}

<div class="cards">
  <div class="card"><h4>L1 pareto frontier</h4><p><b>${(layers[0] ?? []).length}</b> of ${eligible.length} eligible</p>
    <ul>${frontList}</ul></div>
  ${fallbackBlock}
  <div class="card"><h4>suggested pool (<code>only</code>)</h4>
    <p>${picks.map((r) => `<b>${esc(r.name)}</b>`).join(", ")}</p>
    <p class="muted" style="margin-top:.4rem">≤${MAX_POOL} members, none above
    ${COST_CEILING_MULT}× the cheapest. OpenRouter picks one per request, price-weighted,
    reaching the fallbacks only when the cheap ones fail.</p>
    <p class="muted" style="margin-top:.4rem">write to
    <code>providers.openrouter.modelOverrides.${esc(modelId)}.compat.openRouterRouting.only</code>
    — per model, not provider level; the provider-level block keeps the ban.</p></div>
  ${
    allStats && picksStats
      ? `<div class="card"><h4>blended cost $/M</h4>
    <table style="margin:0"><tr><th></th><th>n</th><th>min</th><th>avg</th><th>max</th><th>max/min</th></tr>
    <tr><td>eligible</td><td class="n">${allStats.n}</td><td class="n">${fmt(allStats.min)}</td><td class="n">${fmt(allStats.avg)}</td><td class="n">${fmt(allStats.max)}</td><td class="n">${allStats.spread.toFixed(1)}×</td></tr>
    <tr><td>pool</td><td class="n">${picksStats.n}</td><td class="n">${fmt(picksStats.min)}</td><td class="n">${fmt(picksStats.avg)}</td><td class="n">${fmt(picksStats.max)}</td><td class="n">${picksStats.spread.toFixed(1)}×</td></tr>
    </table></div>`
      : ""
  }
</div>

${groupBlock("fp8+", "fp8 and above")}
${groupBlock("fp4", "fp4")}
${groupBlock("unstated", "unstated precision")}

<h3 class="warn">excluded ${excluded.length ? `· ${excluded.length}` : ""}</h3>
<table>${HEAD_ROW.replace("<th>up30</th>", "<th>reason</th>")}${excluded
    .map(
      (r) =>
        `<tr><td class="pv">${esc(r.name)}</td><td class="q">${esc(r.quant || "?")}</td>
         <td class="n">${fmt(r.blended)}</td><td class="n">${fmt(r.cachePerM)}</td>
         <td class="n">${fmt(r.outPerM)}</td><td class="n">${fmt(r.inPerM)}</td>
         <td class="n">${r.discount ? Math.round(r.discount * 100) + "%" : "-"}</td>
         <td class="n">${esc(r.banned ? "BANNED" : "degraded")}</td></tr>`,
    )
    .join("")}</table>

<p class="foot">
<b>Caveats.</b> <code>latency</code> and <code>throughput</code> are null for every endpoint on this
model, so this report cannot rank by speed — it ranks on cost, precision and 30-minute uptime.
The precision tiers encode "at least fp8" vs "fp4" vs "unstated"; fp4 is not proven worse here.
Uptime is measured on the 30-minute window.<br><br>
Source: <code>https://openrouter.ai/api/v1/models/${esc(modelId)}/endpoints</code> ·
script <code>agent/scripts/openrouter-sales.ts</code> · rerun daily, act on the frontier.
</p>
</body></html>`;
}

const HEAD_ROW =
  "<tr><th>provider</th><th>quant</th><th>blended $/M</th><th>cache $/M</th><th>out $/M</th><th>in $/M</th><th>disc</th><th>up30</th></tr>";

/**
 * Provider slug for `provider.only`. The source of truth is the endpoints-API
 * `tag` prefix (`inference-net/fp8` -> `inference-net`). Deriving from the
 * display name is WRONG wherever the two differ - `InferenceNet` slugifies to
 * `inferencenet`, not `inference-net` - which produced a false "pool drifted"
 * report on 2026-10-12. Never derive a slug from a display name.
 */
function slugOf(r: Report): string {
  const fromTag = r.tag.split("/")[0];
  if (fromTag) return fromTag;
  return r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface ConfiguredModel {
  slug: string;
  roles: string[];
}

/**
 * The distinct OpenRouter models currently pinned in `agent/config.yml`
 * modelRoles - the set this skill reviews, instead of a hardcoded model. Any
 * role set to `openrouter/<author>/<slug>[:level]` contributes, deduped by
 * slug; the `:level` thinking suffix is stripped. Non-OpenRouter roles
 * (`anthropic/...`, `deepseek/...`) are skipped: this report only speaks to
 * OpenRouter's per-upstream routing, which those do not have.
 */
async function configuredModels(): Promise<ConfiguredModel[]> {
  const path = `${import.meta.dir}/../config.yml`;
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`config not found at ${path}`);
  const cfg = Bun.YAML.parse(await file.text()) as { modelRoles?: Record<string, unknown> };
  const bySlug = new Map<string, string[]>();
  for (const [role, value] of Object.entries(cfg?.modelRoles ?? {})) {
    if (typeof value !== "string" || !value.startsWith("openrouter/")) continue;
    const slug = value.slice("openrouter/".length).split(":")[0];
    if (!slug.includes("/")) continue;
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), role]);
  }
  return [...bySlug].map(([slug, roles]) => ({ slug, roles })).sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * One model's recommendation, compact enough that N models fit one screen.
 * Used by --configured; the full table is the single-model mode.
 */
function renderBrief(modelId: string, modelName: string, rows: Report[], roles: string[], billed: string[] = []): string {
  const eligible = rows.filter((r) => !r.banned && !r.degraded);
  if (!eligible.length) return `## ${modelId}\n   roles: ${roles.join(", ")}\n   no eligible upstreams`;

  const { layers } = paretoLayers(eligible);
  const cheapest = Math.min(...eligible.map((r) => r.blended));
  const picks = pool(layers, cheapest);
  const l1 = [...(layers[0] ?? [])].sort((a, b) => a.blended - b.blended);
  const stats = costStats(admitted(picks, rows));
  const out: string[] = [];

  out.push(`## ${modelId}`);
  out.push(`   roles      : ${roles.join(", ")}`);
  out.push(`   eligible   : ${eligible.length} of ${rows.length}   excluded ${rows.length - eligible.length}`);
  out.push(`   mix        : ${mixLine()}`);
  out.push(
    `   L1 frontier: ${l1.map((r) => `${r.name} [${r.quant}] ${fmt(r.blended)}`).join("  |  ") || "none"}`,
  );
  const b8 = l1.find((r) => groupKey(r) === "fp8+");
  const b4 = l1.find((r) => groupKey(r) === "fp4");
  if (b8 && b4 && b4.blended > 0) {
    out.push(
      `   trade      : fp8 ${b8.name} costs ${(b8.blended / b4.blended).toFixed(2)}x fp4 ${b4.name} - precision unproven`,
    );
  }
  if (stats) {
    out.push(
      `   pool cost  : n=${stats.n} endpoints admitted, min ${fmt(stats.min)} avg ${fmt(stats.avg)} max ${fmt(stats.max)} spread ${stats.spread.toFixed(1)}x`,
    );
  }
  const assumed = rows.filter((r) => r.cacheAssumed && !r.banned);
  if (assumed.length) out.push(`   note       : no cache-read price for ${assumed.map((r) => r.tag).join(", ")}; priced at prompt rate`);
  out.push(...billed);
  out.push(`   only       : [${picks.map(slugOf).join(", ")}]`);
  out.push(`   write to   : providers.openrouter.modelOverrides.${modelId}.compat.openRouterRouting.only`);
  return out.join("\n");
}

/** Structured pool result for --configured --json. */
function poolInfo(rows: Report[]) {
  const eligible = rows.filter((r) => !r.banned && !r.degraded);
  if (!eligible.length) return { eligible: 0, slugs: [], names: [], members: [], layers: [], costStats: null };
  const { layers } = paretoLayers(eligible);
  const cheapest = Math.min(...eligible.map((r) => r.blended));
  const picks = pool(layers, cheapest);
  return {
    eligible: eligible.length,
    slugs: picks.map(slugOf),
    names: picks.map((r) => r.name),
    // Uptime is the pool's only time-varying input, so it has to travel with the
    // member - without it the JSON cannot show why a pool is what it is, or
    // differ between two runs. Per-endpoint history lives in the uptime log.
    members: picks.map((r) => ({
      slug: slugOf(r),
      name: r.name,
      quant: r.quant,
      blended: Number(r.blended.toFixed(6)),
      uptime30: r.uptime30,
      uptime1d: r.uptime1d,
      layer: (layers.findIndex((l) => l.includes(r)) + 1) || 0,
    })),
    layers: layers.map((l, i) => ({ layer: i + 1, members: l.map(slugOf) })),
    costStats: costStats(admitted(picks, rows)),
  };
}

// --- main -------------------------------------------------------------------

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const asHtml = args.includes("--html");
const asConfigured = args.includes("--configured");
const VALUE_FLAGS = ["--mix-days", "--mix", "--billed"];
function flagValue(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const explicit = args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1] ?? ""));

const MIX_DAYS = Number(flagValue("--mix-days") ?? 7);
const BILLED_N = Number(flagValue("--billed") ?? 300);
if (!(MIX_DAYS > 0) || !(BILLED_N >= 0)) {
  console.error("--mix-days must be > 0 and --billed >= 0");
  process.exit(2);
}
let MIX_OVERRIDE: Mix | null = null;
if (flagValue("--mix") !== undefined) {
  const parts = String(flagValue("--mix")).split(",").map(Number);
  if (parts.length !== 3 || parts.some((n) => !(n >= 0)) || Math.abs(parts[0] + parts[1] + parts[2] - 1) > 0.01) {
    console.error("--mix wants cache,in,out shares summing to 1, e.g. --mix 0.9,0.09,0.01");
    process.exit(2);
  }
  MIX_OVERRIDE = { cacheRead: parts[0], input: parts[1], output: parts[2] };
}

const REPORTS_DIR = `${import.meta.dir}/../reports`;
const UPTIME_LOG = `${REPORTS_DIR}/openrouter-uptime.jsonl`;

async function reportHtml(data: { id: string; name: string }, rows: Report[], slug: string, billed: string[] = []): Promise<string> {
  // mkdir, not a write to the tracked reports/.keep: overwriting it dirtied the
  // tree on every run.
  await mkdir(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const out = `${REPORTS_DIR}/openrouter-sales-${slug.replace("/", "-")}-${stamp}.html`;
  await Bun.write(out, renderHtml(data.id, data.name, rows, billed));
  return out;
}

/** Session usage is read once per run; a failure to read it is loud, not a silent fallback. */
async function loadUsage(): Promise<Map<string, Usage> | null> {
  if (MIX_OVERRIDE && BILLED_N === 0) return null;
  try {
    return await measureUsage(MIX_DAYS);
  } catch (err) {
    console.error(`usage measurement FAILED: ${(err as Error).message}`);
    process.exit(1);
  }
}

/**
 * Append one row per endpoint to the uptime log.
 *
 * WHY this exists: uptime is the one signal the report ranks on that moves
 * between runs, and the whole reason the pool is drawn from fallback layers
 * rather than the frontier alone is that a member can dip under the warn
 * threshold and be promoted. A snapshot cannot show that - every run sees only
 * the current 30m/1d window with nothing to compare against, so a chronically
 * flaky upstream and one bad 30 minutes look identical. This file is the
 * observation record; it is append-only and nothing rewrites it.
 *
 * `layer` is recomputed from the eligible set, which does not depend on `only`,
 * so rows are comparable across runs even when the pool changed.
 */
async function logUptime(modelId: string, rows: Report[]): Promise<void> {
  const eligible = rows.filter((r) => !r.banned && !r.degraded);
  const { assigned } = paretoLayers(eligible);
  const ts = new Date().toISOString();
  await mkdir(REPORTS_DIR, { recursive: true });
  // One append per row, not one per run: an append of a whole run's rows is
  // larger than the atomic-write window, so two overlapping runs could tear a
  // line and corrupt the file for every later reader.
  for (const r of rows) {
    await appendFile(
      UPTIME_LOG,
      `${JSON.stringify({
        ts,
        model: modelId,
        endpoint: r.tag,
        provider: slugOf(r),
        name: r.name,
        quant: r.quant,
        uptime30: r.uptime30,
        uptime1d: r.uptime1d,
        blended: Number(r.blended.toFixed(6)),
        layer: assigned.get(r) ?? 0,
        banned: r.banned,
        degraded: r.degraded,
        // `blended` depends on the mix, which is now measured per run.
        mix: [MIX.cacheRead, MIX.input, MIX.output].map((n) => Number(n.toFixed(4))),
      })}\n`,
      "utf8",
    );
  }
}

// --configured: review every distinct OpenRouter model pinned in config.yml.
// This is the skill's default job - the harness routes several models through
// OpenRouter, and each needs its own pool. One model failing must not abort
// the rest, so failures are collected and reported at the end.
if (asConfigured) {
  let models: ConfiguredModel[];
  try {
    models = await configuredModels();
  } catch (err) {
    console.error(`could not read configured models: ${(err as Error).message}`);
    process.exit(1);
  }
  if (!models.length) {
    console.error("no OpenRouter models found in config.yml modelRoles");
    process.exit(1);
  }

  const usage = await loadUsage();
  const briefs: string[] = [];
  const failures: string[] = [];
  const skipped: string[] = [];
  const written: string[] = [];

  for (const m of models) {
    let data: { id: string; name: string; endpoints: Endpoint[] };
    try {
      data = await fetchEndpoints(m.slug);
    } catch (err) {
      failures.push(`${m.slug}: ${(err as Error).message}`);
      continue;
    }
    if (!data.endpoints.length) {
      // Router / non-chat models (e.g. a decisions judge) list no endpoints:
      // there is no upstream to choose, so it is out of scope, not a failure.
      skipped.push(`${m.slug} (roles: ${m.roles.join(", ")}): no routable endpoints`);
      continue;
    }
    useMix(data.id, usage, MIX_OVERRIDE, MIX_DAYS);
    // Tiered endpoints are not in the default route (`:floor`/`:nitro` only).
    const tiered = data.endpoints.filter((e) => e.service_tier).map((e) => e.tag);
    const rows = data.endpoints.filter((e) => !e.service_tier).map(build);
    await logUptime(data.id, rows);
    const billed = [
      ...(tiered.length ? [`   tiers      : dropped ${tiered.join(", ")} (flex/priority: not in the default route)`] : []),
      ...(BILLED_N ? await billedSample(usage?.get(data.id), BILLED_N, MIX_DAYS, rows) : []),
    ];
    if (asJson) {
      briefs.push(
        JSON.stringify(
          { model: data.id, name: data.name, roles: m.roles, mix: { ...MIX, source: MIX_SOURCE }, billed, pool: poolInfo(rows) },
          null,
          2,
        ),
      );
    } else {
      briefs.push(renderBrief(data.id, data.name, rows, m.roles, billed));
    }
    if (asHtml) written.push(await reportHtml(data, rows, m.slug, billed));
  }

  if (!asJson) {
    console.log(`# OpenRouter provider review - ${models.length} configured model(s)`);
    console.log(`# banned: ${BANNED.join(", ")}   mix: per model, below`);
    console.log(`# source: config.yml modelRoles; only openrouter/* roles are reviewed`);
    console.log("");
  }
  console.log(asJson ? `[${briefs.join(",\n")}]` : briefs.join("\n\n"));
  if (skipped.length) {
    const sink = (line: string) => (asJson ? console.error(line) : console.log(line));
    sink("");
    sink(`skipped (${skipped.length} of ${models.length}):`);
    for (const s of skipped) sink(`  ${s}`);
  }

  if (written.length) {
    // `report:` lines are progress, not payload — keep them off stdout so
    // `--json` stays parseable when combined with `--html`.
    const sink = (line: string) => (asJson ? console.error(line) : console.log(line));
    sink("");
    for (const w of written) sink(`report: ${w}`);
  }
  if (failures.length) {
    const sink = (line: string) => (asJson ? console.error(line) : console.log(line));
    sink("");
    sink(`FAILED (${failures.length} of ${models.length}):`);
    for (const f of failures) sink(`  ${f}`);
  }
  // Any failed model is a failed run - a partial result must not exit 0.
  process.exit(failures.length ? 1 : 0);
}

// Single-model mode. With no explicit slug, default to the first configured
// OpenRouter model rather than a hardcoded one, so the script follows config.
const slug = explicit ?? (await configuredModels().catch(() => []))[0]?.slug;
if (!slug) {
  console.error("no slug given and no OpenRouter model found in config.yml");
  process.exit(2);
}
const [author, ...rest] = slug.split("/");
if (!author || rest.length === 0) {
  console.error(`bad slug: ${slug} (want author/slug)`);
  process.exit(2);
}

let data: { id: string; name: string; endpoints: Endpoint[] };
try {
  data = await fetchEndpoints(slug);
} catch (err) {
  console.error(`fetch failed: ${(err as Error).message}`);
  process.exit(1);
}
if (!data.endpoints.length) {
  console.log(`${slug}: no routable endpoints (router or non-chat model) - nothing to rank`);
  process.exit(0);
}

const usage = await loadUsage();
useMix(data.id, usage, MIX_OVERRIDE, MIX_DAYS);
const tiered = data.endpoints.filter((e) => e.service_tier).map((e) => e.tag);
const rows = data.endpoints.filter((e) => !e.service_tier).map(build);
await logUptime(data.id, rows);
const billed = [
  ...(tiered.length ? [`   tiers      : dropped ${tiered.join(", ")} (flex/priority: not in the default route)`] : []),
  ...(BILLED_N ? await billedSample(usage?.get(data.id), BILLED_N, MIX_DAYS, rows) : []),
];

if (asJson) {
  const eligible = rows.filter((r) => !r.banned && !r.degraded);
  const { layers, assigned } = paretoLayers(eligible);
  const cheapest = Math.min(...eligible.map((r) => r.blended));
  const poolList = pool(layers, cheapest);
  const payload = {
    model: data.id,
    name: data.name,
    mix: { ...MIX, source: MIX_SOURCE },
    billed,
    banned: BANNED,
    uptimeWarnPct: UPTIME_WARN_PCT,
    pool: poolList.map((r) => r.name),
    poolSlugs: poolList.map(slugOf),
    costStats: {
      eligible: costStats(eligible),
      pool: costStats(admitted(poolList, rows)),
      l1: costStats(layers[0] ?? []),
    },
    endpoints: rows.map((r) => ({
      ...r,
      layer: assigned.get(r) ?? 0,
      onFrontier: (assigned.get(r) ?? 0) === 1,
    })),
  };
  console.log(JSON.stringify(payload, null, 2));
} else if (asHtml) {
  console.log(await reportHtml(data, rows, slug, billed));
} else {
  console.log(render(data.id, data.name, rows));
  if (billed.length) console.log(["", "## billed sample", ...billed].join("\n"));
}
