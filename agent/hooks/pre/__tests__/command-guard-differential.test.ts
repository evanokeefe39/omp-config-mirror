// DIFFERENTIAL CORPUS — the command guard against the frozen reference.
//
// `fixtures/differential-cases.json` is the corpus PR #106 was reviewed against
// (batteries 1-8, 241 rows) extended with the review's 33 round-3 evasion forms,
// the dcg evaluation's 10 fresh evasions, and the rows where this guard is
// STRICTER than main. Each row carries the verdict the design intends (`want`),
// the HEAD and `gh` state to run it under, and — where the two matchers differ —
// a `note` saying why.
//
// Two properties are asserted over the corpus:
//
//   1. every row reaches its intended verdict (`want`), and
//   2. the fail-closed property: whenever the frozen reference BLOCKS, this
//      guard BLOCKS — except for the audited false-positive families, whose
//      budget is reported here and audited in `fixtures/false-positive-families.md`.
//
// The reference is a frozen copy rather than `git show origin/main`: CI checks
// out one commit and `origin/main` does not resolve there. Its sha256 is pinned
// below and asserted before any verdict is trusted.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import oracle from "./fixtures/command-guard-main.ts";
import head from "../command-guard.ts";
import { isAuditedFalsePositive } from "./fixtures/false-positive-families.ts";

const REFERENCE_SHA256 = "59b896bd1eadda0540c3b8302d72fb213511eb9eac033c7178698e2a4003ab80";
const referenceText = readFileSync(new URL("./fixtures/command-guard-main.ts", import.meta.url), "utf8");
const actual = createHash("sha256").update(referenceText).digest("hex");
if (actual !== REFERENCE_SHA256) {
	console.error("FAIL: the reference fixture is not the guard this corpus was written against");
	console.error(`      expected ${REFERENCE_SHA256}`);
	console.error(`      actual   ${actual}`);
	process.exit(1);
}

interface Row {
	group: string;
	label: string;
	command: string;
	head?: string;
	gh?: string;
	want: "allow" | "block";
	note?: string;
}

const rows: Row[] = JSON.parse(readFileSync(new URL("./fixtures/differential-cases.json", import.meta.url), "utf8"));

type Handler = (e: unknown, c: unknown) => unknown;

let CURRENT_HEAD = "feature/omp-13-x";
let GH_ANSWER = "";
let GH_CODE = 0;

function load(mod: (pi: never) => void): Handler {
	let handler: Handler | undefined;
	const pi = {
		on(_n: string, h: Handler) {
			handler = h;
		},
		appendEntry() {},
		exec: async (_cmd: string, args: string[]) => {
			if (args[0] === "rev-parse") return { stdout: `${CURRENT_HEAD}\n`, code: 0 };
			if (args[0] === "ls-remote") return { stdout: "deadbeef\trefs/heads/main\n", code: 0 };
			if (args[0] === "rev-list") return { stdout: "5\n", code: 0 };
			if (args[0] === "pr" && args[1] === "view") return { stdout: "2", code: 0 };
			if (args[0] === "api") return { stdout: GH_ANSWER, code: GH_CODE };
			return { stdout: "", code: 1 };
		},
	};
	mod(pi as never);
	if (!handler) {
		console.error("FAIL: a guard registered no tool_call handler");
		process.exit(1);
	}
	return handler;
}

const oracleHandler = load(oracle as never);
const headHandler = load(head as never);

async function verdict(handler: Handler, row: Row): Promise<string> {
	CURRENT_HEAD = row.head ?? "feature/omp-13-x";
	const gh = row.gh ?? "green";
	if (gh === "unreachable") {
		GH_CODE = 1;
		GH_ANSWER = "";
	} else {
		GH_CODE = 0;
		const state = gh === "green" ? "SUCCESS" : gh === "red" ? "FAILURE" : gh === "pending" ? "PENDING" : "SUCCESS";
		const pr = { number: 2, statusCheckRollup: { state } };
		// `stack` is what makes `gh stack merge` enumerable; without it the gate
		// refuses a stack merge as unverifiable, which is main's documented answer.
		GH_ANSWER = JSON.stringify({ data: { repository: { pullRequest: { ...pr, stack: { entries: { nodes: [{ pullRequest: pr }] } } } } } });
	}
	const res = (await handler({ toolName: "bash", input: { command: row.command } }, { cwd: process.cwd() })) as
		| { block?: boolean }
		| undefined;
	return res?.block === true ? "block" : "allow";
}

let failed = 0;
let fpFixed = 0;
let stricter = 0;
const byGroup = new Map<string, number>();

for (const row of rows) {
	byGroup.set(row.group, (byGroup.get(row.group) ?? 0) + 1);
	const got = await verdict(headHandler, row);
	if (got !== row.want) {
		failed++;
		console.log(`FAIL  want ${row.want}, got ${got}  ${JSON.stringify(row.command)}  [${row.label}]`);
		continue;
	}
	const reference = await verdict(oracleHandler, row);
	if (reference === "block" && got === "allow") {
		if (isAuditedFalsePositive(row.command)) fpFixed++;
		else {
			failed++;
			console.log(`FAIL  the reference blocks this and the guard allows it: ${JSON.stringify(row.command)}`);
		}
	}
	if (reference === "allow" && got === "block") stricter++;
}

// Latency: the hook runs in front of EVERY tool call, so the corpus is timed
// through the same handler the agent would hit. Reported, not asserted — the
// numbers depend on the machine.
const times: number[] = [];
for (let round = 0; round < 3; round++) {
	for (const row of rows) {
		const t0 = performance.now();
		await verdict(headHandler, row);
		times.push(performance.now() - t0);
	}
}
times.sort((a, b) => a - b);
const at = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))];

console.log(`\ndifferential: ${rows.length} rows (${[...byGroup].map(([g, n]) => `${g}:${n}`).join(" ")})`);
console.log(`  false positives fixed (reference blocks, guard allows, all audited): ${fpFixed}`);
console.log(`  stricter than the reference (reference allows, guard blocks): ${stricter}`);
console.log(`  latency over ${times.length} runs: p50 ${at(0.5).toFixed(2)} ms, p95 ${at(0.95).toFixed(2)} ms, max ${times[times.length - 1].toFixed(2)} ms`);
console.log(`${failed === 0 ? "PASS" : `${failed} FAIL`}`);
if (failed) process.exit(1);
