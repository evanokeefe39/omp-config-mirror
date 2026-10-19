/**
 * Lint the `pb-*` playbooks in a skills directory.
 *
 * Usage: bun lint-playbooks.ts [skillsDir]
 *   skillsDir defaults to the skills dir beside this script (`../skills`).
 *
 * Checks, per `pb-*` directory:
 *   (a) todo.json parses with the router's strict `phasesFromSidecar`;
 *   (b) SKILL.md exists with `## When` (a `Not:` line), `## Outcome`, `## Todo`
 *       and `## Done when` (a `Reply:` line);
 *   (c) each item's leading bracketed role list names an agent that exists
 *       (`agents/<name>.md` beside the skills dir) or is bundled
 *       (main, task, scout, reviewer, security-reviewer, sonic);
 *   (d) every `run pb-<name>` resolves to an existing pb-* dir;
 *   (e) no item text is duplicated within the file.
 *
 * Output: `<path>: <reason>` lines. Exit 1 on any problem, 2 if the router
 * parser import fails (never pass silently).
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
// build-model:read
// The parser lives in the router extension's own checkout, outside this repo,
// and the import failure must print a clear error and exit 2 — a static import
// would crash before any handling. That is why this import is dynamic.
//
// The mirror cannot name that checkout, so it is discovered rather than
// hardcoded: the sibling repo under ~/repos whose `src/model.ts` exports
// `phasesFromSidecar`. PLAYBOOK_ROUTER_REPO overrides the search with an
// explicit checkout path.
const ROUTER_EXPORT = "phasesFromSidecar";

function findRouterRepo() {
	const repos = join(homedir(), "repos");
	if (!existsSync(repos)) return join(repos, "router-ext");
	for (const name of readdirSync(repos)) {
		const model = join(repos, name, "src", "model.ts");
		if (existsSync(model) && readFileSync(model, "utf8").includes(`export const ${ROUTER_EXPORT}`)) return join(repos, name);
	}
	return join(repos, "router-ext");
}

const routerModelPath = join(process.env.PLAYBOOK_ROUTER_REPO ?? findRouterRepo(), "src", "model.ts");
const routerModel = await import(routerModelPath).catch(() => null);
if (routerModel === null) {
	console.error(`lint-playbooks: cannot import the router parser from ${routerModelPath} — set PLAYBOOK_ROUTER_REPO to the router extension's checkout (the strict sidecar check is mandatory, not optional)`);
	process.exit(2);
}
const { phasesFromSidecar } = routerModel;

const bundledAgents: Record<string, true> = { main: true, task: true, scout: true, reviewer: true, "security-reviewer": true, sonic: true };

const skillsDir = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "skills");

const dirs = readdirSync(skillsDir)
	.filter((name) => name.startsWith("pb-"))
	.filter((name) => statSync(join(skillsDir, name)).isDirectory());

const problems: string[] = [];
const complain = (dir: string, file: string, reason: string) => problems.push(`${join(dir, file)}: ${reason}`);

for (const dir of dirs) {
	const todoPath = join(skillsDir, dir, "todo.json");
	const skillPath = join(skillsDir, dir, "SKILL.md");

	if (!existsSync(todoPath)) {
		complain(dir, "todo.json", "missing");
	} else {
		const parsed = phasesFromSidecar(readFileSync(todoPath, "utf8"));
		if ("error" in parsed && parsed.error) {
			complain(dir, "todo.json", parsed.error);
		} else if ("phases" in parsed) {
			const allItems: string[] = [];
			for (const phase of parsed.phases) {
				for (const item of phase.items) {
					allItems.push(item);
					const roleMatch = item.match(/^\s*\[([^\]]+)\]/);
					if (roleMatch) {
						for (const role of roleMatch[1].split("|").map((x) => x.trim())) {
							if (role in bundledAgents) continue;
							if (!existsSync(join(skillsDir, "..", "agents", `${role}.md`))) {
								complain(dir, `todo.json (${item})`, `unknown role [${role}]`);
							}
						}
					}
					for (const ref of item.matchAll(/\brun (pb-[\w-]+)/g)) {
						if (!dirs.includes(ref[1])) {
							complain(dir, `todo.json (${item})`, `run ${ref[1]} does not resolve to a playbook`);
						}
					}
				}
			}
			const seen = new Set<string>();
			for (const item of allItems) {
				if (seen.has(item)) complain(dir, "todo.json", `duplicate item text: ${item}`);
				seen.add(item);
			}
		}
	}

	if (!existsSync(skillPath)) {
		complain(dir, "SKILL.md", "missing");
	} else {
		const text = readFileSync(skillPath, "utf8");
		for (const heading of ["## When", "## Outcome", "## Todo", "## Done when"]) {
			if (!text.includes(heading)) complain(dir, "SKILL.md", `missing heading ${heading}`);
		}
		const whenIndex = text.indexOf("## When");
		const nextIndex = text.indexOf("## Outcome");
		if (whenIndex !== -1 && nextIndex !== -1) {
			const when = text.slice(whenIndex, nextIndex);
			if (!when.split("\n").some((line) => line.trimStart().startsWith("Not:"))) {
				complain(dir, "SKILL.md", "When section has no `Not:` line");
			}
		}
		const doneIndex = text.indexOf("## Done when");
		if (doneIndex !== -1 && !text.slice(doneIndex).includes("Reply:")) {
			complain(dir, "SKILL.md", "Done when has no `Reply:` line");
		}
	}
}

for (const line of problems) console.log(line);
process.exit(problems.length > 0 ? 1 : 0);
