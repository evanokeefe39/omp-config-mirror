// NO-REGRESSION PROPERTY — the acceptance test for the structural matcher (OMP-13).
//
// The design contract: the structural view may ALLOW something the text guard
// blocks only when the command is FULLY understood (every segment classified by a
// known grammar). Anything else keeps the text verdict. So the property that must
// hold is one-directional:
//
//     whenever the frozen reference (main's guard, verbatim) BLOCKS, this guard
//     BLOCKS — except for the audited false-positive families.
//
// WHAT THIS DOES NOT CLAIM. This is a regression net over the corpora below, not a
// statement that the guard sees every route to a program. The guard is a
// mistake-proofing floor for a cooperative agent, not a security boundary: a route
// it does not model keeps the text verdict, which is main's answer, and the
// unmodelled routes are listed in `agent/docs/guards.md`, "Limits shared by every
// check" (round-5 review, C1-C4). A new row here is a regression guard; a missing
// row is not a claim of completeness.
//
// It is checked over three corpora in one pass:
//   1. every row of `fixtures/differential-cases.json` (the PR #106 reviewers'
//      batteries 1-8),
//   2. the 33 round-3 evasion forms and the 10 fresh evasions from the dcg
//      evaluation (`docs/research/dcg-command-guard-eval.md`), vendored below,
//   3. a GENERATED cartesian of wrappers × payload forms × banned commands —
//      the class the round-3 review found, generated rather than enumerated, so
//      growing a wrapper list is never the fix (contract point 4).
//
// The reference is a frozen copy, not `git show origin/main` at run time: CI
// checks out one commit and `origin/main` does not resolve there. Its sha256 is
// pinned in the fixture's header and asserted here before any verdict is trusted.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import oracle from "./fixtures/command-guard-main.ts";
import head from "../command-guard.ts";
import { isAuditedFalsePositive } from "./fixtures/false-positive-families.ts";

const REFERENCE_SHA256 = "59b896bd1eadda0540c3b8302d72fb213511eb9eac033c7178698e2a4003ab80";
const referenceText = readFileSync(new URL("./fixtures/command-guard-main.ts", import.meta.url), "utf8");
const actual = createHash("sha256").update(referenceText).digest("hex");
if (actual !== REFERENCE_SHA256) {
	console.error(`FAIL: the reference fixture is not the guard this suite was written against`);
	console.error(`      expected ${REFERENCE_SHA256}`);
	console.error(`      actual   ${actual}`);
	process.exit(1);
}
// The reference is a SNAPSHOT, so nothing here would notice `main`'s guard moving
// under it and the floor silently becoming an old revision (PR #106 round 4, F7).
// Where the repository is reachable — a local run, not a single-commit CI checkout —
// re-derive the snapshot's source and refuse to trust a verdict taken against a
// stale floor. `origin/main` does not resolve in CI, so the check is skipped there
// and the pin above is what CI holds.
const derived = spawnSync("git", ["show", "origin/main:agent/hooks/pre/command-guard.ts"], { encoding: "utf8" });
if (derived.status === 0 && derived.stdout.trim()) {
	const live = createHash("sha256").update(derived.stdout).digest("hex");
	if (live !== REFERENCE_SHA256) {
		console.error("FAIL: origin/main's command guard is not the frozen reference");
		console.error(`      frozen ${REFERENCE_SHA256}`);
		console.error(`      main   ${live}`);
		console.error("      Re-freeze fixtures/command-guard-main.ts from origin/main and re-review the corpus:");
		console.error("      the fail-closed property is only as strong as the floor it is measured against.");
		process.exit(1);
	}
}

interface Row {
	group?: string;
	label: string;
	command: string;
	head?: string;
	gh?: string;
	want?: "allow" | "block";
	note?: string;
}

/** The 33 round-3 evasion forms (VERDICT-106.md §3), by group. */
const ROUND3_FORMS: string[] = [
	// A — `--` (end of options) before a payload
	"ssh box -- pip install x",
	"ssh -t box -- pip install x",
	"ssh box -- sh -c 'pip install x'",
	"ssh -t box -- sh -c 'pip install x'",
	"ssh -o X=Y box -- pip install x",
	"ssh box -- pip3 install x",
	"ssh box -- -- pip install x",
	"docker run --rm img -- pip install x",
	"docker compose run --rm svc -- pip install x",
	"find . -exec -- pip install x \\;",
	// B — docker/compose flags before the sub-command
	"docker compose -f x.yml run --rm svc pip install x",
	"docker compose -f x.yml exec svc pip install x",
	"docker compose -f x.yml run svc sh -c 'pip install x'",
	"docker compose --file x.yml run svc pip install x",
	"docker compose --profile p run svc pip install x",
	"docker compose -p proj run svc pip install x",
	"docker compose --env-file .env run svc pip install x",
	"docker-compose -f x.yml run svc pip install x",
	"docker -H x run img pip install x",
	"docker --context ctx run img pip install x",
	// C — wrapper programs, and `timeout`'s value flags
	"doas pip install x",
	"doas -u root pip install x",
	"chroot /tmp pip install x",
	"chroot /tmp sh -c 'pip install x'",
	"script -qc 'pip install x' /dev/null",
	"script -c 'pip install x' /dev/null",
	"systemd-run --user pip install x",
	"busybox pip install x",
	"busybox sh -c 'pip install x'",
	"parallel pip install x ::: a",
	"parallel sh -c 'pip install x' ::: a",
	"timeout -s KILL 5 pip install x",
	"timeout -k 5 10 pip install x",
];

/** The 10 fresh evasion forms from the dcg evaluation. */
const FRESH_EVASIONS: string[] = [
	"base64 -d <<< cGlwIGluc3RhbGwgeAo= | sh",
	"$(printf pip) install x",
	"alias p=pip; p install x",
	"p(){ pip install x; }; p",
	"env -S 'pip install x'",
	"python3.12 -m pip install x",
	"cd /tmp && timeout -s KILL 5 ssh -t box -- pip install x",
	"docker compose -f x.yml run --rm svc doas -u root pip install x",
	"ssh box 'timeout -s KILL 5 doas pip install x'",
	"git -C /tmp/x checkout -b release/z && git -C /tmp/x push -u origin release/z",
];

/** Wrappers that run the command word after them, as the round-3 review found them. */
const WRAPPERS: string[] = [
	"doas",
	"doas -u root",
	"chroot /tmp",
	"script -c",
	"systemd-run --user",
	"busybox",
	"parallel",
	"timeout -s KILL 5",
	"nice",
	"stdbuf -oL",
	"ionice -c3",
	"setsid",
	"flock /tmp/lock",
	"sudo -u root",
	"env -S",
];

/** How a banned command can be handed to a program. `{c}` is the command. */
const PAYLOAD_FORMS: string[] = [
	"{c}",
	"sh -c '{c}'",
	"ssh box -- {c}",
	"ssh -t box -- {c}",
	"docker compose -f x.yml run svc {c}",
	"docker -H x run img {c}",
	"find . -exec -- {c} \\;",
];

/** Banned commands taken from main's own checks, one per family. */
const BANNED: string[] = [
	"pip install x",
	"git checkout -b release/z",
	"git push origin main",
	"gh issue create",
	"powershell -c x",
	"gh pr merge 2",
	"git commit -m wip",
];

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

async function verdict(handler: Handler, command: string, row?: Row): Promise<string> {
	CURRENT_HEAD = row?.head ?? "feature/omp-13-x";
	const gh = row?.gh ?? "green";
	if (gh === "unreachable") {
		GH_CODE = 1;
		GH_ANSWER = "";
	} else {
		GH_CODE = 0;
		const state = gh === "green" ? "SUCCESS" : gh === "red" ? "FAILURE" : gh === "pending" ? "PENDING" : "SUCCESS";
		const pr = { number: 2, statusCheckRollup: { state } };
		GH_ANSWER = JSON.stringify({ data: { repository: { pullRequest: { ...pr, stack: { entries: { nodes: [{ pullRequest: pr }] } } } } } });
	}
	const res = (await handler({ toolName: "bash", input: { command } }, { cwd: process.cwd() })) as
		| { block?: boolean }
		| undefined;
	return res?.block === true ? "block" : "allow";
}

let fail = 0;
let checked = 0;
let allowedByException = 0;

async function property(command: string, row?: Row, what = ""): Promise<void> {
	checked++;
	const a = await verdict(oracleHandler, command, row);
	if (a !== "block") return; // the property is one-directional
	const b = await verdict(headHandler, command, row);
	if (b === "block") return;
	if (isAuditedFalsePositive(command)) {
		allowedByException++;
		return;
	}
	fail++;
	console.log(`FAIL  ${JSON.stringify(command)}  ${what}  — the reference blocks it, this guard allows it`);
}

// 1. the differential corpus
const rows: Row[] = JSON.parse(readFileSync(new URL("./fixtures/differential-cases.json", import.meta.url), "utf8"));
for (const row of rows) await property(row.command, row, `[${row.label}]`);

// 2. the review's forms and the dcg evaluation's fresh evasions
for (const command of ROUND3_FORMS) await property(command, undefined, "[round-3]");
for (const command of FRESH_EVASIONS) await property(command, undefined, "[fresh evasion]");

// 3. the generated cartesian
for (const wrapper of WRAPPERS) {
	for (const form of PAYLOAD_FORMS) {
		for (const banned of BANNED) {
			const inner = form.replace("{c}", banned);
			await property(`${wrapper} ${inner}`, undefined, `[cartesian ${wrapper} / ${form}]`);
		}
	}
}

// 4. and the audited false positives must still be ALLOWED (the other direction:
//    if one of them starts blocking again, the fix has regressed).
let regressed = 0;
for (const command of [
	"grep -n 'pip install x' agent/docs/guards.md",
	'echo "pip install x"',
	'git commit -m "docs: describe the pip install ban"',
	"gh issue comment 5 --body 'gh issue create'",
	'backlog task edit omp-11 --ac "never run pip install"',
	"echo 'gh pr merge 2'",
	'grep -rn "git checkout -b release/" agent/',
	"gh issue close 5 --comment 'see gh issue create'",
	"cat <<'EOF'\npip install x\nEOF",
	"find . -name '*.ts' -exec grep -n 'pip install' {} \\;",
	"make pip install",
	"eval 'echo \"pip install x\"'",
]) {
	const b = await verdict(headHandler, command);
	if (b === "allow") continue;
	regressed++;
	fail++;
	console.log(`FAIL  ${JSON.stringify(command)}  — an audited false positive is blocked again`);
}

console.log(`\nproperty: ${checked} commands checked`);
console.log(`reference blocks, this guard allows: ${allowedByException} (all in the audited false-positive families)`);
console.log(`false-positive regressions: ${regressed}`);
console.log(`${fail === 0 ? "PASS" : `${fail} FAIL`}`);
if (fail) process.exit(1);
