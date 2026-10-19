// Probe for the command-guard cwd bug (2026-09-17).
//
// Bug: branch detection ran `git rev-parse --abbrev-ref HEAD` in `ctx.cwd`
// always, ignoring a leading `cd <path> &&` in the command. With the harness
// cwd on a repo at `main`, a commit against a correctly-branched SECOND repo
// was blocked — a false block, and one that recurs on the corrected form of
// the workflow the guard exists to encourage.
//
// This probe drives the real hook with a fake pi whose `exec` REPORTS THE
// ARGV IT WAS GIVEN, so we can assert which directory the guard consulted
// rather than trusting the outcome. A block only proves the handler ran; the
// cwd assertion is what proves the fix.
import hook from "../command-guard.ts";
import { homedir } from "node:os";

const HOMEDIR = homedir();
type ExecCall = { cmd: string; args: string[]; cwd?: string };

let handler: ((e: unknown, c: unknown) => unknown) | undefined;

// Branch reported per-directory, so the probe can distinguish "consulted the
// right repo" from "happened to get the answer we wanted".
const BRANCH_BY_DIR: Record<string, string> = {
	"/main-repo": "main",
	"/branched-repo": "docs/resume-voice",
	"/branched repo": "docs/resume-voice",
	"~": "main",
	[`${homedir()}/repos/main-repo`]: "main",
	[`${homedir()}/repos/branched-repo`]: "docs/resume-voice",
	"C:/main-repo": "main",
	"/em/empty-repo": "main",
	"/er/empty-remote": "main",
	"/fb/empty-remote": "feat/x",
	"/ur/unreadable-remote": "main",
};

function makePi(calls: ExecCall[], defaultBranch: string) {
	return {
		on(_n: string, h: (e: unknown, c: unknown) => unknown) {
			handler = h;
		},
		appendEntry() {},
		exec: async (cmd: string, args: string[], opts?: { cwd?: string }) => {
			calls.push({ cmd, args, cwd: opts?.cwd });
			if (args[0] === "rev-parse") {
				return { stdout: `${BRANCH_BY_DIR[opts?.cwd ?? ""] ?? defaultBranch}\n`, code: 0 };
			}
			// An unborn repo has zero commits, which is the only bootstrap allowance.
			if (args[0] === "rev-list") {
				const empty = (opts?.cwd ?? "").endsWith("empty-repo");
				return { stdout: empty ? "0\n" : "5\n", code: 0 };
			}
			// Only `origin` under an *empty-remote dir lacks main/master (it may hold
			// feature branches, which ls-remote filters out when asked for both refs),
			// so a misread remote word or a dropped ref filter cannot pass; an
			// unreadable remote exits non-zero.
			if (args[0] === "ls-remote") {
				const dir = opts?.cwd ?? "";
				if (dir.endsWith("unreadable-remote")) return { stdout: "", code: 128 };
				const filtered = args.includes("refs/heads/main") && args.includes("refs/heads/master");
				const empty = dir.endsWith("empty-remote") && args[2] === "origin" && filtered;
				return { stdout: empty ? "" : "abc123\trefs/heads/main\n", code: 0 };
			}
			return { stdout: "", code: 0 };
		},
	};
}

interface Case {
	desc: string;
	command: string;
	harnessCwd: string;
	/** Branch the harness cwd repo reports when nothing else is resolved. */
	harnessBranch: string;
	expectBlocked: boolean;
	/** Directory the guard must have queried, or undefined to skip the check. */
	expectCwd: string;
}

const cases: Case[] = [
	{
		desc: "cd into branched repo, commit — MUST be allowed (the reported bug)",
		command: "cd /branched-repo && git add -A && git commit -m 'docs: x'",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: false,
		expectCwd: "/branched-repo",
	},
	{
		desc: "cd into MAIN repo, commit — MUST still be blocked (protection intact)",
		command: "cd /main-repo && git commit -m 'docs: x'",
		harnessCwd: "/branched-repo",
		harnessBranch: "docs/resume-voice",
		expectBlocked: true,
		expectCwd: "/main-repo",
	},
	{
		desc: "git -C into branched repo, commit — MUST be allowed",
		command: "git -C /branched-repo commit -m 'docs: x'",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: false,
		expectCwd: "/branched-repo",
	},
	{
		desc: "git -C into MAIN repo, commit — MUST be blocked",
		command: "git -C /main-repo commit -m 'docs: x'",
		harnessCwd: "/branched-repo",
		harnessBranch: "docs/resume-voice",
		expectBlocked: true,
		expectCwd: "/main-repo",
	},
	{
		desc: "no cd, harness cwd on main — MUST be blocked (unchanged behaviour)",
		command: "git commit -m 'docs: x'",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: true,
		expectCwd: "/main-repo",
	},
	{
		desc: "cd with quotes and a spaced path — MUST be allowed",
		command: "cd '/branched repo' && git commit -m 'docs: x'",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: false,
		expectCwd: "/branched repo",
	},
	{
		desc: "non-leading cd is NOT guessed at — harness cwd governs",
		command: "echo hi ; cd /branched-repo && git commit -m 'docs: x'",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: true,
		expectCwd: "/main-repo",
	},
	{
		desc: "git -C on MAIN while harness cwd branched — push blocked",
		command: "git -C /main-repo push",
		harnessCwd: "/branched-repo",
		harnessBranch: "docs/resume-voice",
		expectBlocked: true,
		expectCwd: "/main-repo",
	},
	{
		desc: "TILDE: cd ~/repos/branched && commit — must resolve, not fail open",
		command: "cd ~/repos/branched-repo && git commit -m 'docs: x'",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: false,
		expectCwd: `${HOMEDIR}/repos/branched-repo`,
	},
	{
		desc: "TILDE on a MAIN repo — must still block, not fail open",
		command: "cd ~/repos/main-repo && git commit -m 'docs: x'",
		harnessCwd: "/branched-repo",
		harnessBranch: "docs/resume-voice",
		expectBlocked: true,
		expectCwd: `${HOMEDIR}/repos/main-repo`,
	},
	{
		desc: "MSYS /c/... drive form is normalized for the spawn",
		command: "cd /c/main-repo && git commit -m 'docs: x'",
		harnessCwd: "/branched-repo",
		harnessBranch: "docs/resume-voice",
		expectBlocked: true,
		expectCwd: "C:/main-repo",
	},
	{
		desc: "bootstrap: unborn repo reached via cd — allowance must use THAT repo",
		command: "cd /em/empty-repo && git commit -m 'docs: x'",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: false,
		expectCwd: "/em/empty-repo",
	},
	{
		desc: "git -c <k=v> config flag no longer bypasses the gate",
		command: "git -c user.name=a commit -m 'docs: x'",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: true,
		expectCwd: "/main-repo",
	},
	{
		desc: "bootstrap push: on main, remote has no main/master — allowed",
		command: "cd /er/empty-remote && git push -u origin main",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: false,
		expectCwd: "/er/empty-remote",
	},
	{
		desc: "bootstrap push: explicit ref to main from a feature branch, remote has no main/master — allowed",
		command: "cd /fb/empty-remote && git push origin 6104a21:refs/heads/main",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: false,
		expectCwd: "/fb/empty-remote",
	},
	{
		desc: "push to main, remote already has branches — blocked",
		command: "git push -u origin main",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: true,
		expectCwd: "/main-repo",
	},
	{
		desc: "push to main naming a DIFFERENT remote than the empty one — blocked",
		command: "cd /er/empty-remote && git push upstream main",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: true,
		expectCwd: "/er/empty-remote",
	},
	{
		desc: "two pushes in one chain to an empty remote — blocked (second lands on a live remote)",
		command: "cd /fb/empty-remote && git push origin a:refs/heads/main && git push origin b:refs/heads/main",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: true,
		expectCwd: "/fb/empty-remote",
	},
	{
		desc: "remote unreadable (ls-remote fails) — blocked, fails closed",
		command: "cd /ur/unreadable-remote && git push -u origin main",
		harnessCwd: "/main-repo",
		harnessBranch: "main",
		expectBlocked: true,
		expectCwd: "/ur/unreadable-remote",
	},
];

let fail = 0;
for (const c of cases) {
	const calls: ExecCall[] = [];
	handler = undefined;
	hook(makePi(calls, c.harnessBranch) as never);
	if (!handler) {
		console.error("FAIL: hook registered no handler");
		process.exit(1);
	}

	const res = (await handler(
		{ toolName: "bash", input: { command: c.command } },
		{ cwd: c.harnessCwd },
	)) as { block?: boolean } | undefined;
	const blocked = res?.block === true;

	const revParse = calls.find((x) => x.args[0] === "rev-parse");
	const queriedCwd = revParse?.cwd;

	const okBlock = blocked === c.expectBlocked;
	const okCwd = c.expectCwd === undefined || queriedCwd === c.expectCwd;
	if (!okBlock || !okCwd) fail++;

	const bits = [
		`blocked=${blocked} (want ${c.expectBlocked})`,
		`queried=${queriedCwd ?? "none"} (want ${c.expectCwd})`,
	];
	console.log(`${okBlock && okCwd ? "PASS" : "FAIL"}  ${bits.join("  ")}  [${c.desc}]`);
}

console.log(`\n${cases.length - fail}/${cases.length} passed`);
if (fail) process.exit(1);
