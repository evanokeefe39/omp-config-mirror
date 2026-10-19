// CHAIN-AWARE BRANCH ALLOWANCE — the compound `checkout -b X && ... && commit` form.
//
// WHY THIS FILE EXISTS
// Measured 2026-09-19: the guard read HEAD once, before execution, so a chain that
// created its own branch and then committed was refused —
//
//     git checkout -b docs/x && git add f && git commit -m "docs: ..."
//     Blocked (no-commit-on-main): HEAD is 'main'.
//
// That is a false block on the corrected workflow the guard exists to encourage,
// and it re-blocks after every correction. The fix proves the chain from the
// COMMAND TEXT (no shell), so it is a fact about the command rather than a waiver
// the checked agent could write.
//
// The NEGATIVE cases matter more than the positive ones: each is a bypass found
// while testing the fix against itself, including one where the allowance's early
// `return` skipped the other guards entirely.
//
// NOTHING HERE MUTATES. The handler only READS the command string and consults
// real HEAD; returning is the whole of its effect. No add, commit or push in these
// cases executes. A green run is evidence about the guard's DECISION.
//
// HEAD is read from REAL git repos that this file CREATES at run time, under the
// system temp dir. Two seeded repos are needed: one on `main` (so the branch gate
// engages) and a second real repo (so the `-C` cases point at something git can
// actually resolve — an unreadable path makes `currentBranch` return null and the
// gate fails OPEN, which would make the assertion meaningless).
//
// The fixtures are built here rather than hardcoded because a path outside any
// repo is host-specific: it vanishes when tmp is cleared and differs on another
// machine, at which point the suite would silently stop being evidence. They are
// removed on exit.
//
// `repoIsEmpty` MUST be false in the fixture: a repo with an unborn HEAD trips the
// bootstrap allowance, which permits any commit and would let the negatives pass
// for the wrong reason. Each fixture is therefore given one real commit.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import hook from "../command-guard.ts";

let handler: ((e: unknown, c: unknown) => unknown) | undefined;

const pi = {
	on(_n: string, h: (e: unknown, c: unknown) => unknown) {
		handler = h;
	},
	appendEntry() {},
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

/**
 * Every fixture dir, registered the moment it exists.
 *
 * The handler is registered BEFORE the first `makeRepo` call, and each dir is
 * pushed immediately after `mkdtempSync` returns — before any git call that can
 * throw. That is deliberate: the previous shape registered the cleanup AFTER both
 * repos were built and captured them as consts, so a throw in the second
 * `makeRepo` left the first (a full repo, with .git and objects) on disk with no
 * handler covering it, and a throw inside `makeRepo` left an empty dir.
 *
 * FALSIFIED, not assumed: injecting a throw into the second `makeRepo` left one
 * orphaned `guard-chain-*` dir behind. Two green runs could never reach that path,
 * because neither orphan is reachable from a successful run. This shape files the
 * dir for cleanup at creation, so a throw anywhere leaves nothing.
 */
const FIXTURES: string[] = [];
process.on("exit", () => {
	for (const dir of FIXTURES) rmSync(dir, { recursive: true, force: true });
});

/** Run git and require success, so a broken fixture fails loudly, not silently. */
function git(cwd: string, ...args: string[]): void {
	const r = Bun.spawnSync(["git", ...args], { cwd });
	if (r.exitCode !== 0) {
		throw new Error(`fixture git ${args.join(" ")} failed in ${cwd}: ${r.stderr.toString()}`);
	}
}

/** A repo with ONE commit, so `repoIsEmpty` is false and the gate engages. */
function makeRepo(branch: string): string {
	const dir = mkdtempSync(join(tmpdir(), "guard-chain-"));
	FIXTURES.push(dir); // file it BEFORE the first call that can throw
	git(dir, "init", "-q");
	git(dir, "symbolic-ref", "HEAD", `refs/heads/${branch}`);
	git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "chore: seed");
	return dir;
}

const G = "git";
const FIXTURE = makeRepo("main");
/**
 * A SECOND real repo, for the `-C` cases: the path must resolve to real git.
 * Forward slashes because it is embedded in a command string, where a backslash
 * is an escape.
 */
const OTHER = makeRepo("main").replace(/\\/g, "/");

/** The guard's decision for one command string, run against the fixture repo. */
async function decide(command: string): Promise<{ block: boolean; reason: string }> {
	const res = (await handler({ toolName: "bash", input: { command } }, { cwd: FIXTURE })) as
		| { block?: boolean; reason?: string }
		| undefined;
	return { block: res?.block === true, reason: res?.reason ?? "" };
}

interface Case {
	command: string;
	desc: string;
	/**
	 * What must happen when HEAD is `main`. `allow` = the chain allowance
	 * applies (no block from the branch gate). `blockAt` = a substring the
	 * block reason must contain, which is how a specific guard is pinned.
	 */
	expect: "allow" | string;
}

const CASES: Case[] = [
	// ---- POSITIVE: a valid branch-creating chain must NOT be blocked by the gate ----
	{ command: `${G} checkout -b feat/x && ${G} commit -m "feat: x"`, desc: "simple branch+commit", expect: "allow" },
	{ command: `${G} checkout -b docs/y && ${G} add f && ${G} commit -m "docs: y"`, desc: "add between", expect: "allow" },
	{ command: `${G} checkout -b docs/y && ${G} add . && ${G} status && ${G} commit -m "docs: y"`, desc: "add+status between", expect: "allow" },
	{ command: `cd src && ${G} checkout -b feat/x && ${G} add . && ${G} commit -m "feat: x"`, desc: "leading cd", expect: "allow" },
	{ command: `${G} checkout -b feat/x && mkdir -p a && ${G} add . && ${G} commit -m "feat: x"`, desc: "non-git step between", expect: "allow" },
	{ command: `${G} checkout -b feat/x && ${G} commit -m "feat: x" && ${G} push -u origin feat/x`, desc: "commit then push", expect: "allow" },

	// ---- NEGATIVE: bypasses and genuine main-writes ----
	// The mid-chain HEAD re-move — the second commit lands on main.
	{ command: `${G} checkout -b feat/x && ${G} commit -m "chore: x" && ${G} checkout main && ${G} commit -m "chore: y"`, desc: "HEAD re-moved to main then commit", expect: "no-commit-on-main" },
	{ command: `${G} checkout -b feat/x && ${G} switch main && ${G} commit -m "chore: x"`, desc: "switch back then commit", expect: "no-commit-on-main" },
	{ command: `${G} checkout -b feat/x && ${G} commit -m "chore: x" && ${G} reset --hard && ${G} commit -m "chore: y"`, desc: "reset after", expect: "no-commit-on-main" },
	// -C targets another repo, so the checkout says nothing about the commit.
	// The path must be a REAL repo: an unreadable one makes `currentBranch` return
	// null and the gate fails OPEN — a pre-existing hole, so the fixture is a
	// second seeded repo rather than a bogus path.
	{ command: `${G} checkout -b feat/x && ${G} -C ${OTHER} commit -m "chore: x"`, desc: "-C after checkout", expect: "no-commit-on-main" },
	{ command: `${G} -C ${OTHER} checkout -b feat/x && ${G} commit -m "chore: x"`, desc: "-C before checkout", expect: "no-commit-on-main" },
	// Substring hazard: a message MENTIONING a branch creation is not one.
	{ command: `${G} commit -m "chore: doc ${G} checkout -b feat/x"`, desc: "branch text inside a message", expect: "no-commit-on-main" },
	// Order: a commit before the checkout is never allowed.
	{ command: `${G} commit -m "chore: x" && ${G} checkout -b feat/x`, desc: "commit before checkout", expect: "no-commit-on-main" },
	// An invalid branch name must not unlock the chain.
	{ command: `${G} checkout -b tmp/bad && ${G} commit -m "chore: x"`, desc: "invalid branch name", expect: "no-commit-on-main" },
	// Ambiguous HEAD-movers between checkout and commit.
	{ command: `${G} checkout -b feat/x && ${G} stash && ${G} commit -m "chore: x"`, desc: "stash between", expect: "no-commit-on-main" },
	{ command: `${G} checkout -b feat/x && ${G} pull --rebase && ${G} commit -m "chore: x"`, desc: "pull --rebase between", expect: "no-commit-on-main" },

	// ---- THE ALLOWANCE MUST NOT SKIP THE OTHER GUARDS ----
	// A first cut of the allowance `return`ed early, so an allowed chain carried a
	// non-conventional message straight past the block. The chain here is otherwise
	// ALLOWED (valid branch creation, HEAD-neutral steps), so reaching
	// `conventional-commits` proves control fell through to CHECKS.
	{ command: `${G} checkout -b feat/x && ${G} commit -m "no type here"`, desc: "allowed chain still checked for message", expect: "conventional-commits" },
	// A bare `merge` is itself a HEAD-mover, so the chain rule rejects it FIRST and
	// the reason is the stricter one. That is correct behaviour, not a skip: what
	// this pins is that the merge is never allowed through.
	{ command: `${G} checkout -b feat/x && ${G} commit -m "feat: ok" && ${G} merge y`, desc: "bare merge in a chain is never allowed", expect: "no-commit-on-main" },
	// With no commit in the chain the branch gate is not in play at all, so the
	// merge check is reachable and must fire.
	{ command: `${G} checkout -b feat/x && ${G} merge y`, desc: "merge check reachable without a commit", expect: "no-bare-merge" },

	// ---- LINE CONTINUATIONS ----
	// `joinContinuations` runs BEFORE the checks, so the splitter must see the
	// JOINED string. A backslash-newline is a line join, not a separator; if the
	// segmenter ran on the raw text it would mis-split and could permit what the
	// un-continued form blocks.
	{ command: `${G} checkout -b feat/x \\\n&& ${G} commit -m "feat: x"`, desc: "valid chain split across a continuation", expect: "allow" },
	{ command: `${G} checkout -b feat/x \\\n&& ${G} commit -m "chore: x" \\\n&& ${G} checkout main && ${G} commit -m "chore: y"`, desc: "continuation must not hide a HEAD re-move", expect: "no-commit-on-main" },
];

let fail = 0;
for (const c of CASES) {
	const { block, reason } = await decide(c.command);
	const ok =
		c.expect === "allow" ? !block || !reason.includes("no-commit-on-main") : block && reason.includes(c.expect);
	if (!ok) fail++;
	const got = block ? `block(${(reason.split(")")[0] || "?").replace("Blocked (", "")})` : "allow";
	console.log(`${ok ? "PASS" : "FAIL"}  got=${got.padEnd(22)} want=${c.expect.padEnd(20)}  [${c.desc}]`);
}
console.log(`\n${CASES.length - fail}/${CASES.length} passed`);
if (fail) process.exit(1);
