// MERGE GATE (OMP-9 AC3) — no merge while any check is failing or pending.
//
// `gh pr merge` and `gh stack merge` read their checks through `gh api graphql`,
// so every case here stubs `pi.exec` with the shape that call really returns.
// Measured 2026-10-19 against gh 2.81.0 and a live four-PR stack:
// `statusCheckRollup` is null when a PR has no checks, and its `state` is one of
// SUCCESS, PENDING, EXPECTED, FAILURE, ERROR (the StatusState enum). The stack
// is reached through `pullRequest.stack.entries.nodes[].pullRequest`.
//
// The two DECISIONS are pinned as hard as the verdicts are:
//   - a PR with NO checks at all is ALLOWED — a repo with no CI must stay
//     mergeable, and the rule is about checks that exist;
//   - anything UNVERIFIABLE blocks — an unreachable gh, a non-zero exit, an
//     unparseable answer, an unknown state, a PR that will not resolve, a stack
//     that will not enumerate. The checked agent controls the environment this
//     hook is handed, and "I could not see the checks" is not evidence of green.
//
// A command that another check already refuses never reaches the gate, and
// neither does a read-only one: those cases assert that NO gh call was made at
// all, which is how the gate's cost is bounded.
//
// The import is RELATIVE so the suite tests the copy of the guard beside it.
import hook from "../command-guard.ts";

interface Plan {
	/** Rollup state per PR number; null = the PR reports no checks. */
	rollup?: Record<number, string | null>;
	/** Stack contents per PR number; "none" = the PR is not in a stack. */
	stacks?: Record<number, [number, string | null][] | "none">;
	/** Exit code of the graphql call. */
	code?: number;
	/** Raw stdout of the graphql call, for answers that do not parse. */
	raw?: string;
	/** The PR number `gh pr view` answers; null = no PR for this branch. */
	view?: number | null;
}

interface Case {
	command: string;
	desc: string;
	want: "allow" | "block";
	plan: Plan;
	/** Substring the block reason must carry, so the right check is pinned. */
	expect?: string;
	/** Substrings that must appear in the gh arguments, so the right call is pinned. */
	expectArgs?: string[];
	/** The command must not touch gh at all. */
	noGhCalls?: boolean;
}

const CASES: Case[] = [
	// ---- the verdicts ----
	{ command: "gh pr merge 2 --squash", desc: "every check passing allows the merge", want: "allow", plan: { rollup: { 2: "SUCCESS" } } },
	{
		command: "gh pr merge 2 --squash",
		desc: "a failing check refuses the merge",
		want: "block",
		plan: { rollup: { 2: "FAILURE" } },
		expect: "checks-not-green",
	},
	{
		command: "gh pr merge 2 --squash",
		desc: "a pending check refuses the merge",
		want: "block",
		plan: { rollup: { 2: "PENDING" } },
		expect: "checks-not-green",
	},
	{
		command: "gh pr merge 2 --squash",
		desc: "checks EXPECTED but not yet reported refuse the merge",
		want: "block",
		plan: { rollup: { 2: "EXPECTED" } },
		expect: "checks-not-green",
	},
	{
		command: "gh pr merge 2 --squash",
		desc: "a PR with NO checks is allowed: a repo with no CI stays mergeable",
		want: "allow",
		plan: { rollup: { 2: null } },
	},
	{
		command: "gh pr merge 2 --squash --auto",
		desc: "--auto does not lift the gate (auto-merge waits only for REQUIRED checks)",
		want: "block",
		plan: { rollup: { 2: "PENDING" } },
		expect: "checks-not-green",
	},

	// ---- the unverifiable direction: every one of these fails CLOSED ----
	{
		command: "gh pr merge 2 --squash",
		desc: "an unknown rollup state fails closed",
		want: "block",
		plan: { rollup: { 2: "SOMETHING_NEW" } },
		expect: "checks-unverified",
	},
	{
		command: "gh pr merge 2 --squash",
		desc: "gh exiting non-zero fails closed",
		want: "block",
		plan: { code: 1 },
		expect: "checks-unverified",
	},
	{
		command: "gh pr merge 2 --squash",
		desc: "an answer that does not parse fails closed",
		want: "block",
		plan: { raw: "gh: not authenticated" },
		expect: "checks-unverified",
	},
	{
		command: "gh pr merge 2 --squash",
		desc: "a PR that does not resolve fails closed",
		want: "block",
		plan: {
			code: 1,
			raw: JSON.stringify({
				data: { repository: { pullRequest: null } },
				errors: [{ message: "Could not resolve to a PullRequest with the number of 2." }],
			}),
		},
		expect: "checks-unverified",
	},
	{
		command: "gh pr merge --squash",
		desc: "no selector: the current branch's PR is resolved through gh",
		want: "allow",
		plan: { view: 9, rollup: { 9: "SUCCESS" } },
	},
	{
		command: "gh pr merge --squash",
		desc: "no selector and no PR for the branch fails closed",
		want: "block",
		plan: { view: null },
		expect: "checks-unverified",
	},
	{
		command: "gh pr merge https://github.com/evanokeefe39/omp-home/pull/41 --squash",
		desc: "a PR URL names the number to check",
		want: "allow",
		plan: { rollup: { 41: "SUCCESS" } },
		expectArgs: ["owner=evanokeefe39", "name=omp-home"],
	},
	{
		command: "gh pr merge https://github.com/other-org/other-repo/pull/41 --squash",
		desc: "a PR URL for ANOTHER repo is read from that repo, not from this one",
		want: "allow",
		plan: { rollup: { 41: "SUCCESS" } },
		expectArgs: ["owner=other-org", "name=other-repo"],
	},
	{
		command: "gh pr merge 2 -R other-org/other-repo --squash",
		desc: "-R after the verb names the repo to read",
		want: "allow",
		plan: { rollup: { 2: "SUCCESS" } },
		expectArgs: ["owner=other-org", "name=other-repo"],
	},
	{
		command: "gh -R other-org/other-repo pr merge 2 --squash",
		desc: "-R before the verb names it too",
		want: "allow",
		plan: { rollup: { 2: "SUCCESS" } },
		expectArgs: ["owner=other-org", "name=other-repo"],
	},
	{
		command: "gh pr merge 2 -R other-org/other-repo --squash",
		desc: "a red PR in the named repo refuses the merge",
		want: "block",
		plan: { rollup: { 2: "FAILURE" } },
		expect: "checks-not-green",
		expectArgs: ["name=other-repo"],
	},
	{
		command: "gh pr merge 2 --squash",
		desc: "with no repo named, gh's own placeholders resolve the repository",
		want: "allow",
		plan: { rollup: { 2: "SUCCESS" } },
		expectArgs: ["owner={owner}", "name={repo}"],
	},

	// ---- stacks: every PR the merge would land is checked ----
	{
		command: "gh stack merge 92 --squash --yes",
		desc: "a red PR BELOW the ceiling refuses the stack",
		want: "block",
		plan: {
			rollup: { 92: "SUCCESS" },
			stacks: { 92: [[90, "SUCCESS"], [91, "FAILURE"], [92, "SUCCESS"]] },
		},
		expect: "#91",
	},
	{
		command: "gh stack merge 92 --squash --yes",
		desc: "a stack that is green throughout is allowed",
		want: "allow",
		plan: {
			rollup: { 92: "SUCCESS" },
			stacks: { 92: [[90, "SUCCESS"], [91, "SUCCESS"], [92, "SUCCESS"]] },
		},
	},
	{
		command: "gh stack merge 92 --squash --yes",
		desc: "a PR below the ceiling with no checks does not refuse the stack",
		want: "allow",
		plan: { rollup: { 92: "SUCCESS" }, stacks: { 92: [[90, null], [92, "SUCCESS"]] } },
	},
	{
		command: "gh stack merge 92 --squash --yes",
		desc: "a PR that is not in a stack fails closed (the PRs to land cannot be enumerated)",
		want: "block",
		plan: { rollup: { 92: "SUCCESS" }, stacks: { 92: "none" } },
		expect: "checks-unverified",
	},
	{
		command: "gh stack merge --squash --yes",
		desc: "no selector: the current stack is resolved through gh, and a pending PR below refuses it",
		want: "block",
		plan: { view: 92, rollup: { 92: "SUCCESS" }, stacks: { 92: [[90, "PENDING"], [92, "SUCCESS"]] } },
		expect: "#90",
	},

	// ---- the gate must stay out of everything else ----
	{ command: "gh pr create --fill", desc: "a non-merge gh command is not gated", want: "allow", plan: {}, noGhCalls: true },
	{ command: "gh pr checks 2 --watch", desc: "reading checks is not gated", want: "allow", plan: {}, noGhCalls: true },
	{
		command: "gh pr merge 2",
		desc: "an unsquashed merge is refused by no-bare-merge, without a gh call",
		want: "block",
		plan: { rollup: { 2: "SUCCESS" } },
		expect: "no-bare-merge",
		noGhCalls: true,
	},
	{
		command: "echo 'gh pr merge 2 --squash'",
		desc: "quoted text names no merge",
		want: "allow",
		plan: {},
		noGhCalls: true,
	},
	// ---- THE MERGE, REACHED ANOTHER WAY (PR #106 review, findings 1-3) ----
	// A merge the gate never sees is a merge the gate cannot refuse: the nested
	// forms must reach the rollup, not skip it.
	{
		command: "if true; then gh pr merge 2 --squash; fi",
		desc: "a keyword before the command does not hide the merge",
		want: "block",
		plan: { rollup: { 2: "FAILURE" } },
		expect: "checks-not-green",
	},
	{
		command: "for i in 1; do gh pr merge 2 --squash; done",
		desc: "nor does for/do",
		want: "block",
		plan: { rollup: { 2: "FAILURE" } },
		expect: "checks-not-green",
	},
	{
		command: "timeout 30 gh pr merge 2 --squash",
		desc: "a wrapper's duration is not the program",
		want: "block",
		plan: { rollup: { 2: "FAILURE" } },
		expect: "checks-not-green",
	},
	{
		command: "bash <<'EOF'\ngh pr merge 2 --squash\nEOF",
		desc: "a shell reading a heredoc runs the body, so the gate sees the merge",
		want: "block",
		plan: { rollup: { 2: "FAILURE" } },
		expect: "checks-not-green",
	},
	// ---- merges inside a payload, or inside quotes, are NOT gated here ----
	// The merge is found by TEXT with quoted spans removed, so a payload handed to
	// `ssh`, `docker` or `find` is quoted text: it is neither gated nor refused by
	// this check. Closing that needs the structural matcher (a separate change);
	// `docs/guards.md` states it under the gate's Gaps.
];

const CALLS: string[][] = [];
let handler: ((e: unknown, c: unknown) => unknown) | undefined;
let plan: Plan = {};

const pi = {
	on(_name: string, h: (e: unknown, c: unknown) => unknown) {
		handler = h;
	},
	appendEntry() {},
	exec: async (cmd: string, args: string[]) => {
		CALLS.push([cmd, ...args]);
		if (args[0] === "rev-parse") return { stdout: "feat/x\n", code: 0 };
		if (args[0] === "pr" && args[1] === "view") {
			return plan.view === null ? { stdout: "", code: 1 } : { stdout: String(plan.view ?? 9), code: 0 };
		}
		if (args[0] !== "api") return { stdout: "", code: 1 };
		if (plan.raw !== undefined) return { stdout: plan.raw, code: plan.code ?? 0 };
		if (plan.code !== undefined) return { stdout: "", code: plan.code };
		const num = Number(args.find((a) => a.startsWith("num="))?.slice(4) ?? 0);
		const pr: Record<string, unknown> = { number: num };
		const state = plan.rollup?.[num];
		if (state !== undefined) pr.statusCheckRollup = state === null ? null : { state };
		const stack = plan.stacks?.[num];
		if (stack !== undefined) {
			pr.stack =
				stack === "none"
					? null
					: {
							entries: {
								nodes: stack.map(([n, s]) => ({
									pullRequest: { number: n, statusCheckRollup: s === null ? null : { state: s } },
								})),
							},
						};
		}
		return { stdout: JSON.stringify({ data: { repository: { pullRequest: pr } } }), code: 0 };
	},
};

hook(pi as never);
if (!handler) {
	console.error("FAIL: hook registered no tool_call handler");
	process.exit(1);
}

let fail = 0;
for (const c of CASES) {
	CALLS.length = 0;
	plan = c.plan;
	const res = (await handler({ toolName: "bash", input: { command: c.command } }, { cwd: process.cwd() })) as
		| { block?: boolean; reason?: string }
		| undefined;
	const blocked = res?.block === true;
	const okVerdict = blocked === (c.want === "block");
	const okReason = !c.expect || (res?.reason ?? "").includes(c.expect);
	const ghCalls = CALLS.filter(([cmd]) => cmd === "gh").length;
	const okCalls = !c.noGhCalls || ghCalls === 0;
	const flat = CALLS.map((call) => call.join(" ")).join(" ;; ");
	const missing = (c.expectArgs ?? []).filter((needle) => !flat.includes(needle));
	const okArgs = missing.length === 0;
	const ok = okVerdict && okReason && okCalls && okArgs;
	if (!ok) fail++;
	console.log(
		`${ok ? "PASS" : "FAIL"}  ${blocked ? "block" : "allow"} (want ${c.want})  gh-calls=${ghCalls}  ${c.command}  [${c.desc}]`,
	);
	if (missing.length) console.log(`      gh args never carried: ${missing.join(", ")}\n      got: ${flat}`);
	if (!ok && res?.reason) console.log(`      ${res.reason.split("\n")[0]}`);
}

console.log(`\n${CASES.length - fail}/${CASES.length} passed`);
if (fail) process.exit(1);
