// command-guard issues-in-backlog — new issues go to Backlog.md, not GitHub.
//
// Both creation routes must block (`gh issue create`, and `gh api` POSTing to a
// repo's /issues collection), while every read/comment/close on an EXISTING
// GitHub issue stays allowed: those are how an issue already filed on GitHub is
// closed with a pointer to its Backlog.md task, so over-blocking them would
// strand the tickets still filed there.
//
// The import is RELATIVE so the suite tests the copy of the guard beside it.
import hook from "../command-guard.ts";

let handler: ((e: unknown, c: unknown) => unknown) | undefined;

const pi = {
	on(_name: string, h: (e: unknown, c: unknown) => unknown) {
		handler = h;
	},
	appendEntry() {},
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
	["gh issue create --title 'x' --body 'y'", "gh issue create is the primary route", "block"],
	["cd repo && gh issue create -R evanokeefe39/jobs-repo -t x -b y", "create after a cd prefix", "block"],
	["gh api repos/evanokeefe39/jobs-repo/issues -f title=x -f body=y", "api create via field flags (gh defaults to POST)", "block"],
	["gh api -X POST /repos/evanokeefe39/jobs-repo/issues --input issue.json", "api create with explicit POST and --input", "block"],
	["gh api --method POST repos/o/r/issues -F title=x", "api create with --method POST", "block"],
	["gh issue list -R evanokeefe39/jobs-repo", "listing is a read", "allow"],
	["gh issue view 89 -R evanokeefe39/example-ext", "viewing is a read", "allow"],
	["gh issue close 14 -R evanokeefe39/jobs-repo -c 'Moved to Backlog OMP-90'", "closing an existing issue, pointing at its task", "allow"],
	["gh issue comment 14 -b 'Moved to Backlog'", "commenting on an existing issue", "allow"],
	["gh issue comment 8 --body 'the command guard blocks gh issue create now'", "OMP-11: a comment body quoting the banned command", "allow"],
	["gh issue close 8 --comment 'see gh issue create for the old route'", "OMP-11: a closing comment quoting the banned command", "allow"],
	["gh api repos/evanokeefe39/jobs-repo/issues --paginate", "api GET of the collection is a read", "allow"],
	["gh api repos/o/r/issues/14/comments -f body='Moved to Backlog'", "a comment POST is not issue creation", "allow"],
	["gh api repos/o/r/issues/14 -X PATCH -f state=closed", "closing via api PATCH on one issue", "allow"],
	["gh pr create --fill", "PRs are unaffected", "allow"],
	["echo 'gh issue creates are banned' > note.txt", "prose containing the words, not the command", "allow"],
];

let fail = 0;
for (const [command, desc, want] of cases) {
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
