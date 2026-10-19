// GITHUB NATIVE STACKS — `gh stack` must obey the same merge and branch rules as git.
//
// `pb-land` lands stacks with `gh stack merge`, and `pb-open-pr` builds them with
// `gh stack init|add`. Neither command goes through `git merge` or
// `git checkout -b`, so without these cases the guard would wave through a
// merge-commit landing (non-interactive `gh stack merge` reuses the last merge
// method) and an auto-generated `03-24-add_login` branch name. Both directions are
// pinned: the squash and well-named forms pass, the bare and badly named forms block.
//
// NOTHING HERE EXECUTES. The matchers are string tests and the stub `exec` reports
// a non-main branch, so the branch-discipline gate stays out of the way.
//
// The import is RELATIVE so the suite tests the copy of the guard beside it.
import hook from "../command-guard.ts";

let handler: ((e: unknown, c: unknown) => unknown) | undefined;

const pi = {
	on(_name: string, h: (e: unknown, c: unknown) => unknown) {
		handler = h;
	},
	appendEntry() {},
	// The merge gate reads the check state through `gh api graphql` and, when no
	// selector is given, resolves the PR through `gh pr view`. Both answer green
	// here, so a case about branch naming or the merge-method rule is never
	// decided by the gate rather than by the check under test.
	exec: async (_cmd: string, args: string[]) => {
		if (args[0] === "pr" && args[1] === "view") return { stdout: "42", code: 0 };
		if (args[0] !== "api") return { stdout: "feature/x\n", code: 0 };
		const num = Number(args.find((a) => a.startsWith("num="))?.slice(4) ?? 42);
		const green = { number: num, statusCheckRollup: { state: "SUCCESS" } };
		return {
			stdout: JSON.stringify({
				data: { repository: { pullRequest: { ...green, stack: { entries: { nodes: [{ pullRequest: green }] } } } } },
			}),
			code: 0,
		};
	},
};

hook(pi as never);
if (!handler) {
	console.error("FAIL: hook registered no tool_call handler");
	process.exit(1);
}

const cases: [command: string, shouldBlock: boolean, why: string][] = [
	["gh stack merge --yes", true, "bare stack merge reuses the last method"],
	["gh stack merge 42 --yes --merge", true, "explicit merge commit"],
	["gh stack merge --merge-method merge --yes", true, "merge-method merge"],
	["gh stack merge 42 --squash --yes", false, "squash"],
	["gh stack merge --merge-method squash --yes", false, "merge-method squash"],
	["gh stack merge --rebase", false, "rebase is allowed like gh pr merge --rebase"],
	["gh stack add -Am 'Add login endpoint'", true, "auto-generated date-slug name"],
	["gh stack add -m \"wip\"", true, "auto-generated name, double quotes"],
	["gh stack add api-routes", true, "name without a kind prefix"],
	["gh stack init", true, "interactive init with no name"],
	["gh stack init --base main feature/omp-19-a feature-api", true, "second name lacks a prefix"],
	["gh stack init --base main feature/omp-19-a feature/omp-20-b", false, "every name prefixed, --base value skipped"],
	["gh stack add -Am 'Add tests' feature/omp-21-c", false, "message removed, prefixed name kept"],
	["gh stack add docs/omp-22-readme", false, "docs kind"],
	["gh stack view --json", false, "read-only stack command"],
	["gh stack submit --open", false, "submit creates no branch"],
	["grep -n \"gh stack add api-routes\" agent/docs/guards.md", false, "quoted text names no branch"],
	["echo 'gh stack init'", false, "quoted text, single quotes"],
	["gh stack init feature/omp-19-a && gh stack add bogus-name", true, "second stack command in a chain is checked"],
];

let fail = 0;
for (const [command, shouldBlock, why] of cases) {
	const res = (await handler({ toolName: "bash", input: { command } }, { cwd: process.cwd() })) as
		| { block?: boolean; reason?: string }
		| undefined;
	const blocked = res?.block === true;
	const ok = blocked === shouldBlock;
	if (!ok) fail++;
	console.log(`${ok ? "PASS" : "FAIL"}  ${shouldBlock ? "block" : "allow"}  ${command}  [${why}]`);
}
console.log(`\n${cases.length - fail}/${cases.length} passed`);
if (fail) process.exit(1);
