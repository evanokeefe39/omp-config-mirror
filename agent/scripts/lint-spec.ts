// lint-spec — deterministic lint for behavioural specs written under pb-spec.
//
// Proves: a spec has the required sections (Intent, Behavioral Contracts, Edge
// Case Inventory, Negative Space, Open Questions), every contract under
// Behavioral Contracts is phrased testably (GIVEN/WHEN/THEN or EARS
// `WHEN … SHALL`), no `[NEEDS CLARIFICATION` marker survived, Open Questions
// is empty or says none, and no implementation technology leaked into
// Behavioral Contracts.
//
// Does NOT prove: that contracts are correct or complete, that edge cases
// actually cover each contract, that the spec was approved by the user, or
// that design honoured it. Those are pb-spec's doc-reviewer step, not this.
//
// Usage: bun lint-spec.ts <spec.md>
//   exit 0 = clean; exit 1 = problems, one per line as `<file>:<line>: <reason>`.
import { readFileSync, existsSync } from "node:fs";

const REQUIRED = ["Intent", "Behavioral Contracts", "Edge Case Inventory", "Negative Space", "Open Questions"];
const TECH: Record<string, true> = {
  postgres: true, duckdb: true, react: true, kafka: true, redis: true,
  dagster: true, sql: true, typescript: true, python: true, aws: true, docker: true,
};

const file = process.argv[2];
if (!file || process.argv.length !== 3 || !file.endsWith(".md")) {
  console.error("usage: bun lint-spec.ts <spec.md>");
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`lint-spec: file not found: ${file}`);
  process.exit(1);
}

const lines = readFileSync(file, "utf8").split("\n");
const problems: string[] = [];
const fail = (line: number, reason: string) => problems.push(`${file}:${line}: ${reason}`);

// Map section names (lowercased) to body line ranges.
const sections: Record<string, { start: number; end: number }> = {};
let current: string | null = null;
for (let i = 0; i < lines.length; i++) {
  const heading = lines[i].match(/^##\s+(.+?)\s*$/);
  if (heading) {
    if (current) sections[current].end = i;
    current = heading[1].toLowerCase();
    sections[current] = { start: i + 1, end: lines.length };
  }
}
if (current) sections[current].end = lines.length;

for (const name of REQUIRED) {
  if (!(name.toLowerCase() in sections)) fail(0, `missing required section: ${name}`);
}

const contracts = sections["behavioral contracts"];
if (contracts) {
  for (let i = contracts.start; i < contracts.end; i++) {
    const raw = lines[i];
    const bullet = raw.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
    if (!bullet) continue;
    const text = bullet[1].toLowerCase();
    const gwt = text.includes("given") && text.includes("when") && text.includes("then");
    const ears = /^(?:\*\*)?when\b.*\bshall\b/i.test(bullet[1]);
    if (!gwt && !ears) fail(i + 1, `contract without GIVEN/WHEN/THEN or EARS WHEN…SHALL: ${bullet[1].slice(0, 80)}`);
    for (const word of text.split(/[^a-z0-9]+/)) {
      if (TECH[word]) fail(i + 1, `technology name "${word}" in Behavioral Contracts`);
    }
  }
}

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("[NEEDS CLARIFICATION")) fail(i + 1, "unresolved [NEEDS CLARIFICATION] marker");
}

const oq = sections["open questions"];
if (oq) {
  const body = lines.slice(oq.start, oq.end).map((l) => l.trim()).filter((l) => l && !/^(-{3,}|_{3,})$/.test(l));
  if (body.length > 0 && !body.every((l) => /^(?:none|-|nil|nothing)\b/i.test(l.replace(/^\s*(?:[-*])\s*/, "")))) {
    fail(oq.start + 1, "Open Questions must be empty or say none");
  }
}

// Duplicate-content check: an edit tool mis-applying a hunk can insert a line
// twice, so the same substantive sentence ends up side by side in the spec.
// Headings are exempt — a spec legitimately repeats the same `### Edge` heading
// under Contracts and under the edge-case inventory. Lines under 40 chars are
// exempt too: below that a line is boilerplate (a marker, a label, a table
// fragment) that legitimately repeats; at 40+ chars an exact repeat of the
// trimmed text is far more likely a botched edit than intentional prose.
const MIN_DUP_LEN = 40;
const seen = new Map<string, number[]>();
for (let i = 0; i < lines.length; i++) {
  const text = lines[i].trim();
  if (!text || text.startsWith("#") || text.length < MIN_DUP_LEN) continue;
  const spots = seen.get(text);
  if (spots) spots.push(i + 1);
  else seen.set(text, [i + 1]);
}
for (const [text, spots] of seen) {
  if (spots.length > 1) fail(spots[0], `duplicate content line on lines ${spots.join(", ")}: ${text.slice(0, 80)}`);
}

if (problems.length > 0) {
  console.log(problems.join("\n"));
  process.exit(1);
}
process.exit(0);
