// BRANCH PREFIXES — the task's `kind` label names the branch.
//
// The prefix is the one field a branch and its task must agree on
// (`skill://git-conventions` Branching, `skill://backlog-conventions`), so this
// suite pins both directions: every kind prefix is accepted, the commit-type
// prefixes other repos document stay accepted, and `release/`, `spike/`, a bare
// name and a generated `owner/<id>` form are refused.
//
// WHY THE REFUSALS MATTER AS MUCH AS THE ALLOWS. `release/` was accepted until
// 2026-10-11 and a release is now a tag release-please makes on `main`, so a
// suite that only asserted the new prefixes would pass while the guard still
// advertised a branch type that no longer exists. The case behaviour is pinned
// too: the matcher is case-sensitive by construction and stays that way, so
// `Feature/x` is refused rather than quietly accepted by a new `i` flag.
//
// NOTHING HERE EXECUTES. `checkout -b` alone consults no git — BRANCH_CREATE and
// BRANCH_OK are pure string tests — and the stub `exec` reports a non-main branch
// so the branch-discipline gate stays out of the way and CHECKS is reached. A
// green run is evidence about the guard's decision, not about a repo.
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
	// ---- ACCEPTED: the task's kind, then `<id>-<slug>` ----
	["git checkout -b bugfix/omp-12-null-cursor", "the guard's own example", "allow"],
	["git checkout -b bugfix/x", "kind prefix, no task id in the slug", "allow"],
	["git -C /tmp/repo checkout -b bugfix/omp-12-x", "-C with a kind prefix stays allowed", "allow"],
	["git checkout -b feature/omp-1-x", "feature kind", "allow"],
	["git switch -c feature/omp-1-x", "switch -c is the same act", "allow"],
	["git checkout -b continuous-improvement/x", "the longest kind", "allow"],
	["git checkout -b refactor/omp-3-y", "refactor is both kind and type", "allow"],
	["git checkout -b spec/omp-6-c", "spec kind", "allow"],
	["git checkout -b design/omp-4-a", "design kind", "allow"],
	["git checkout -b investigation/omp-5-b", "investigation kind", "allow"],
	["git checkout -b migration/omp-9-z", "migration kind", "allow"],
	["git checkout -b chore/bootstrap", "chore kind", "allow"],
	["git checkout -b docs/bootstrap", "docs kind", "allow"],
	["git checkout -b content/post-2", "content kind", "allow"],

	// ---- ACCEPTED: the commit-type prefixes other repos' AGENTS.md documents ----
	["git checkout -b feat/x", "feat stays accepted", "allow"],
	["git checkout -b fix/omp-12-null-cursor", "fix stays accepted", "allow"],
	["git checkout -b perf/omp-7-d", "perf stays accepted", "allow"],
	["git checkout -b test/omp-8-e", "test stays accepted", "allow"],
	["git checkout -b ci/pin-actions", "ci stays accepted", "allow"],
	["git checkout -b build/bump-uv", "build stays accepted", "allow"],

	// ---- REFUSED ----
	["git checkout -b release/v1.2.0", "release/ is retired", "block"],
	["git switch -c release/v1.2.0", "retired on switch -c too", "block"],
	["git -C /tmp/repo checkout -b release/v1.2.0", "-C targets a repo, not a different rule", "block"],
	["git -c core.hooksPath=/dev/null checkout -b release/v9.9.9", "-c k=v is the same act", "block"],
	["git --git-dir=/tmp/repo/.git switch -c spike/x", "a global option hides no prefix", "block"],
	["git checkout -b spike/x", "spike/ was never a prefix", "block"],
	["git checkout -b owner/omp-49-x", "a generated owner/<id> name carries no kind", "block"],
	["git checkout -b Feature/x", "case-sensitive: Feature/ is not feature/", "block"],
	["git checkout -b hotfix/omp-1-x", "a hotfix goes forward on a bugfix/ branch", "block"],
	["git checkout -b my-random-branch", "a bare name makes no promise", "block"],
	["git checkout -b feature", "the prefix needs its slash", "block"],
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
