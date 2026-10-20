/**
 * Frame-recall probe for snapcompact.
 *
 * The question the harness has not answered: when deepseek-v4.1-flash reads a
 * snapcompact FRAME (pixel-font glyphs rendered to a PNG), can it recall facts
 * from it — or does it invent them? The recorded 2026-10-18 measurement was
 * 0/5 and 1/5 facts recalled from a frame against 5/5 from the same text.
 *
 * This renders the SAME planted-fact text two ways — plain text, and a
 * snapcompact frame via the real renderer omp ships — and asks the same
 * questions of each. A frame score below the text score means the encoding
 * loses information the model then fills in from nowhere, which is the failure
 * that matters (an invented value is worse than a refusal).
 *
 * Usage:  bun run agent/scripts/frame-recall-probe.ts
 * Output: C:/tmp/frame-recall/<stamp>/  (frames, answers, score.json)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderMany, resolveShape } from "@oh-my-pi/snapcompact";

const MODEL = "deepseek/deepseek-v4.1-flash";
const OUT_ROOT = "C:/tmp/frame-recall";

// ─── the planted facts ──────────────────────────────────────────────────────
//
// Deliberately arbitrary and unguessable: no world knowledge, no round numbers,
// nothing a model could arrive at by inference. Each answer is a single token,
// so scoring is exact-match rather than a judgement call.
const FACTS: Array<{ q: string; a: string }> = [
  { q: "What is the deployment token? Reply with the token only.", a: "QX7-4412-KL" },
  { q: "How many shards does the ingest table use? Reply with the number only.", a: "17" },
  { q: "What is the name of the on-call rotation? Reply with the name only.", a: "emberwatch" },
  { q: "What port does the sidecar listen on? Reply with the port only.", a: "8631" },
  { q: "Which engineer signed off on the migration? Reply with the surname only.", a: "Vasquez" },
];

// Padding so the document is long enough to paginate into a real frame rather
// than a single short line — the frame is the artefact under test.
const FILLER = Array.from(
  { length: 40 },
  (_, i) =>
    `Section ${i + 1}: the pipeline stage ${i + 1} consumes the output of stage ${i} and writes a partition ` +
    `keyed by tenant id. Retries are bounded at three attempts with exponential backoff. ` +
    `This paragraph exists to give the archive realistic bulk so the frame is dense.`,
).join("\n\n");

const DOCUMENT = `OPERATIONS HANDBOOK — INTERNAL

The deployment token is QX7-4412-KL and must be rotated every quarter.

The ingest table uses 17 shards. Rebalancing is manual and requires a maintenance window.

The on-call rotation is named emberwatch.

The sidecar listens on port 8631.

The migration was signed off by engineer Vasquez.

${FILLER}
`;

// ─── the model call ─────────────────────────────────────────────────────────

type Content =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function ask(key: string, content: Content[], q: string): Promise<{ ok: boolean; text: string; err?: string }> {
  const body = {
    model: MODEL,
    messages: [{ role: "user", content: [...content, { type: "text", text: q }] }],
    max_tokens: 60,
    temperature: 0,
    reasoning: { enabled: false },
  };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, text: "", err: `${res.status} ${(await res.text()).slice(0, 200)}` };
  const d = (await res.json()) as any;
  return { ok: true, text: (d.choices?.[0]?.message?.content ?? "").trim() };
}

function score(answer: string, expected: string): boolean {
  const a = answer.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const e = expected.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return a.includes(e);
}

// ─── run ────────────────────────────────────────────────────────────────────

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error("OPENROUTER_API_KEY is not set — cannot run the probe.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(OUT_ROOT, stamp);
mkdirSync(outDir, { recursive: true });

console.log(`model:  ${MODEL}`);
console.log(`out:    ${outDir}`);
console.log(`facts:  ${FACTS.length}`);

// Resolve the frame shape exactly as omp's compaction path does — same call,
// same model id — so the frames under test are the frames a real compaction
// would produce, not a hand-picked geometry.
const shape = resolveShape({ id: MODEL });
console.log(`shape:  ${shape.variant ?? "?"} frameSize=${shape.frameSize} cols=${shape.columns} rows=${shape.rows}`);

const frames = await renderMany(DOCUMENT, { shape, maxFrames: 6 });
console.log(`frames: ${frames.length}`);

// ImageContent carries base64 in `data` with a `mimeType`; the frame is the
// artefact under test, so write it out to look at.
frames.forEach((f, i) => {
  writeFileSync(join(outDir, `frame-${i}.png`), Buffer.from(f.data, "base64"));
});
writeFileSync(join(outDir, "source.txt"), DOCUMENT);

const frameContent: Content[] = frames.map((f) => ({
  type: "image_url" as const,
  image_url: { url: `data:${f.mimeType};base64,${f.data}` },
}));
const textContent: Content[] = [{ type: "text", text: DOCUMENT }];

const results: any = { model: MODEL, stamp, frames: frames.length, text: [], frame: [] };

for (const mode of ["text", "frame"] as const) {
  const content = mode === "text" ? textContent : frameContent;
  console.log(`\n── ${mode.toUpperCase()} ──`);
  for (const { q, a } of FACTS) {
    const r = await ask(key, content, q);
    const got = r.ok ? r.text : `ERROR ${r.err}`;
    const hit = r.ok && score(got, a);
    results[mode].push({ q, expected: a, got, hit, ok: r.ok });
    console.log(`  ${hit ? "PASS" : "MISS"}  expected=${a.padEnd(12)} got=${got.slice(0, 60)}`);
  }
  results[`${mode}_score`] = results[mode].filter((x: any) => x.hit).length;
}

writeFileSync(join(outDir, "score.json"), JSON.stringify(results, null, 2));

const t = results.text_score;
const f = results.frame_score;
console.log(`\n══ RESULT ══`);
console.log(`  text  ${t}/${FACTS.length}`);
console.log(`  frame ${f}/${FACTS.length}`);
console.log(`  written to ${join(outDir, "score.json")}`);
