// command-guard-precision — a matcher must read what is actually there, not a
// prefix or a substring of it.
//
// Three measured precision failures:
//
//   1. conventional-commits searched for the message flag over the WHOLE command,
//      so a heredoc BODY line reading "no-commit-on-main" was parsed as a flag of
//      "ain", and a legitimate commit was refused for a message it never had. A
//      heredoc body is stdin data. Measured 2026-09-28.
//
//   2. no-bare-merge used `\b` after `merge`, which also matches the read-only
//      plumbing sharing that prefix: merge-base, merge-tree, merge-file,
//      merge-index. A word boundary sits between "e" and "-". `git merge-tree
//      --write-tree` was blocked mid-investigation. Measured 2026-09-28.
//
//   3. Narrowing (1) to the commit's own LINE was necessary but not sufficient:
//      the flag pattern still matched a `-m` inside a hyphenated word, and its
//      `\s*` allowed zero characters, so `joint-most-fired` read as the flag plus
//      "ost-fired" and a path `plan-msg.txt` read as the flag plus "sg.txt". Three
//      live blocks in a row — two for a filename in the commit's own `-F`
//      argument. `--message` was likewise matched only by accident, capturing
//      "essage". Measured 2026-09-28, same day.
//
// Each fix must not weaken enforcement, so the regression cases below are as much
// the point of this file as the allow cases are.
//
// The import is RELATIVE. It was an absolute path to this repo's main worktree,
// which meant the suite silently tested a different copy of the guard whenever it
// ran from a worktree or a clone — a green result about code nobody was editing.
import hook from "../command-guard.ts";

const records: { type: string; data: unknown }[] = [];
let handler: ((e: unknown, c: unknown) => unknown) | undefined;

const pi = {
	on(_name: string, h: (e: unknown, c: unknown) => unknown) {
		handler = h;
	},
	appendEntry(type: string, data: unknown) {
		records.push({ type, data });
	},
	// non-main branch, so branch discipline does not fire and CHECKS is reached
	exec: async () => ({ stdout: "feat/x\n", code: 0 }),
};

hook(pi as never);
if (!handler) {
	console.error("FAIL: hook registered no tool_call handler");
	process.exit(1);
}

type Want = "allow" | "block";
const cases: [string, string, Want][] = [
	[
		"git commit -q -F - <<'MSG'\nfix(x): real message\n\nobserved: no-commit-on-main fired 55 times\nMSG",
		"heredoc body containing '-m' inside a word must NOT be read as a message flag",
		"allow",
	],
	[
		"git commit -m 'no type here'",
		"an actually non-conventional -m is still blocked",
		"block",
	],
	[
		"git commit \\\n  -m 'still not conventional'",
		"a backslash-continued -m is joined and still inspected",
		"block",
	],
	[
		"git commit -m 'fix(x): conventional'",
		"a conventional -m is allowed",
		"allow",
	],
	// no-bare-merge must not fire on the plumbing that shares its prefix
	[
		"git merge-base origin/main HEAD",
		"merge-base is a query, not a merge",
		"allow",
	],
	[
		"git merge-tree --write-tree origin/main HEAD",
		"merge-tree is plumbing, not a merge",
		"allow",
	],
	["git merge feature", "a genuine bare merge is still blocked", "block"],
	["gh pr merge 2", "an unsquashed PR merge is still blocked", "block"],
	["gh pr merge 2 --squash", "a squash merge is allowed", "allow"],
	// The message flag must be a standalone token, not a `-m` inside a word
	[
		`git commit -q -F "C:/tmp/plan-msg.txt"`,
		"a path containing '-m' is not a message flag",
		"allow",
	],
	[
		`git commit -q -F "C:/tmp/plan-msg.txt" --author "a-most-b-fix@example.invalid"`,
		"two separate '-m…' words in the arguments are still not a flag",
		"allow",
	],
	[
		"git commit -m 'docs(x): note the joint-most-fired guard'",
		"a real flag is still read even when a '-m' word follows in the message",
		"allow",
	],
	[
		"git commit --message 'no type here'",
		"the long form is checked deliberately, not by matching inside it",
		"block",
	],
	[
		"git commit --message 'fix(x): conventional'",
		"a conventional --message is allowed",
		"allow",
	],
	// `style` is in the spec's canonical set and was the one member missing
	[
		"git commit -m 'style(tests): sort the transcribe test imports'",
		"`style` is a canonical conventional type, not a refusal",
		"allow",
	],
	[
		"git commit -m 'stylez: not a type'",
		"`style` does not open the gate to any word starting with it",
		"block",
	],
];

let fail = 0;
for (const [command, desc, want] of cases) {
	records.length = 0;
	const res = (await handler({ toolName: "bash", input: { command } }, { cwd: process.cwd() })) as
		| { block?: boolean; reason?: string }
		| undefined;
	const got: Want = res?.block === true ? "block" : "allow";
	const ok = got === want;
	if (!ok) fail++;
	console.log(`${ok ? "PASS" : "FAIL"}  got=${got} want=${want}  [${desc}]`);
	if (!ok && res?.reason) console.log(`      ${res.reason.split("\n")[0]}`);
}

console.log(`\n${cases.length - fail}/${cases.length} passed`);
if (fail) process.exit(1);
