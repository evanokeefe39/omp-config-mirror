// END-TO-END, REAL GIT, FRESH PROCESS.
//
// Every other suite fakes `exec`. This one does not: `pi.exec` spawns real git
// through the same shape the hook uses, so path normalization and real repo HEAD
// are exercised together. That is what settles whether the ordinary
// `cd ~/repos/... && git commit` form works, rather than passing because a stub
// answered for any cwd.
//
// THE FIXTURES ARE PROVISIONED, NOT BORROWED. This suite used to point at
// `~/repos/voice-samples` and `~/repos/jobs-repo` and assert their
// branch state. Measured 2026-09-28: `jobs-repo` had since been left on
// a feature branch, so the "must BLOCK" case could no longer fire and the suite
// sat at 3/4 — red for a reason that had nothing to do with the guard, and green
// or red depending on what unrelated work had done to those repos. A test whose
// verdict is external state is not a test.
//
// The fixtures live under `~` so `~` expansion and the MSYS `/c/...` drive form
// are still exercised for real — that was the original reason for borrowing real
// repos, and it is preserved. They are removed afterwards.
//
// NOTHING HERE MUTATES A REAL REPO. The hook only READS the command string to
// decide whether to block; the handler returning is the whole of its effect. No
// `git add`, commit or push in these cases ever executes — the guard is asked
// what it would do, and a green run is evidence about that decision.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import hook from "../command-guard.ts";

let handler: ((e: unknown, c: unknown) => unknown) | undefined;

const pi = {
	on(_n: string, h: (e: unknown, c: unknown) => unknown) {
		handler = h;
	},
	appendEntry() {},
	// REAL git. No stub, no fake branch table.
	exec: (cmd: string, args: string[], opts?: { cwd?: string; timeout?: number }) =>
		new Promise<{ stdout?: string; stderr?: string; code?: number }>((resolve) => {
			try {
				const p = spawn(cmd, args, { cwd: opts?.cwd });
				let stdout = "";
				let stderr = "";
				p.stdout?.on("data", (d) => (stdout += String(d)));
				p.stderr?.on("data", (d) => (stderr += String(d)));
				p.on("error", (e) => resolve({ code: -1, stderr: String(e) }));
				p.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
			} catch (e) {
				resolve({ code: -1, stderr: String(e) });
			}
		}),
};

hook(pi as never);
if (!handler) {
	console.error("FAIL: no handler");
	process.exit(1);
}

const HOME = homedir().replace(/\\/g, "/"); // C:/Users/<user>
const MSYS = `/${HOME[0].toLowerCase()}${HOME.slice(2)}`; // /c/Users/<user>

function git(cwd: string, ...args: string[]): void {
	const p = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (p.status !== 0) throw new Error(`git ${args.join(" ")} in ${cwd}: ${p.stderr?.trim()}`);
}

/** A real repo under `~`, with a real commit and a known HEAD. */
function provision(name: string, branch: string): string {
	const dir = join(HOME, name);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	git(dir, "init", "-q", "-b", "main");
	git(dir, "config", "user.email", "guard-e2e@example.invalid");
	git(dir, "config", "user.name", "guard-e2e");
	writeFileSync(join(dir, "README.md"), "# guard e2e fixture\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-q", "-m", "chore: fixture");
	if (branch !== "main") git(dir, "checkout", "-q", "-b", branch);
	return dir;
}

const FIXTURES = [".guard-e2e-branched", ".guard-e2e-on-main"];
const branched = provision(".guard-e2e-branched", "feat/x");
const onMain = provision(".guard-e2e-on-main", "main");

// Harness cwd sits on a repo at `main` — the situation the cwd probe exists for.
const HARNESS_CWD = onMain;

const cases: { desc: string; command: string; want: "block" | "allow" }[] = [
	{
		desc: "REAL: cd ~/.guard-e2e-branched (branched) && commit — must ALLOW",
		command: "cd ~/.guard-e2e-branched && git add -A && git commit -m 'docs: x'",
		want: "allow",
	},
	{
		desc: "REAL: cd /c/... (branched) && commit — must ALLOW",
		command: `cd ${MSYS}/.guard-e2e-branched && git commit -m 'docs: x'`,
		want: "allow",
	},
	{
		desc: "REAL: cd ~/.guard-e2e-on-main (MAIN) && commit — must BLOCK",
		command: "cd ~/.guard-e2e-on-main && git commit -m 'docs: x'",
		want: "block",
	},
	{
		desc: "REAL: git -C <branched repo> commit — must ALLOW",
		command: `git -C ${branched} commit -m 'docs: x'`,
		want: "allow",
	},
];

let fail = 0;
try {
	for (const c of cases) {
		const res = (await handler(
			{ toolName: "bash", input: { command: c.command } },
			{ cwd: HARNESS_CWD },
		)) as { block?: boolean; reason?: string } | undefined;
		const blocked = res?.block === true;
		const ok = (c.want === "block") === blocked;
		if (!ok) fail++;
		console.log(`${ok ? "PASS" : "FAIL"}  blocked=${blocked} (want ${c.want})`);
		console.log(`   ${c.desc}`);
		if (!ok && res?.reason) console.log(`   reason: ${res.reason.split("\n")[0]}`);
	}
} finally {
	for (const f of FIXTURES) rmSync(join(HOME, f), { recursive: true, force: true });
}

console.log(`\n${cases.length - fail}/${cases.length} passed`);
if (fail) process.exit(1);
