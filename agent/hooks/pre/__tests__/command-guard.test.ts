// Harness for the NEW command-guard: assert guard-ok: is ignored on every check.
// Loads the real hook from disk and drives it with a fake pi API.
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
	// currentBranch() shells out to git; report a non-main branch so the
	// branch-discipline block does not fire and we reach the CHECKS loop.
	exec: async () => ({ stdout: "feat/x\n", code: 0 }),
};

hook(pi as never);
if (!handler) {
	console.error("FAIL: hook registered no tool_call handler");
	process.exit(1);
}

const cases: [string, string][] = [
	// [command, description]  — each carries a guard-ok: marker that MUST be ignored
	["pip install requests", "pip, no marker"],
	["pip install requests guard-ok: legitimate one-off", "pip WITH guard-ok (must still block)"],
	["powershell.exe -c 'ls' guard-ok: need it", "powershell WITH guard-ok"],
	["git merge feature guard-ok: genuinely needed", "bare merge WITH guard-ok"],
	["git checkout -b my-random-branch guard-ok: whatever", "bad branch name WITH guard-ok"],
	["git commit -m 'no type here' guard-ok: clearer", "bad commit msg WITH guard-ok"],
];

let fail = 0;
for (const [command, desc] of cases) {
	records.length = 0;
	const res = (await handler({ toolName: "bash", input: { command } }, { cwd: process.cwd() })) as
		| { block?: boolean; reason?: string }
		| undefined;
	const blocked = res?.block === true;
	const emittedBlock = records.some((r) => r.type === "dev.omp.harness.guard-block");
	const emittedSuppression = records.some((r) => r.type === "dev.omp.harness.guard-suppression");
	const ok = blocked && emittedBlock && !emittedSuppression;
	if (!ok) fail++;
	console.log(
		`${ok ? "PASS" : "FAIL"}  blocked=${blocked} block-recs=${emittedBlock} suppress-recs=${emittedSuppression}  [${desc}]`,
	);
}
console.log(`\n${cases.length - fail}/${cases.length} passed`);
if (fail) process.exit(1);
