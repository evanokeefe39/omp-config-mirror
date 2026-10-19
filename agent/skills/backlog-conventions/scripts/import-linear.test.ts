// splitCriteria — Linear description prose -> Backlog.md `--ac` / `--dod` fields.
//
// The importer creates the live card every lazily imported board shows. A criteria
// block that runs on too far moves real description text into a criterion (seven of
// the export's open tickets lost a trailing `Related to …` line that way on
// 2026-10-18), and one that stops short leaves criteria as prose the board shows as
// "Acceptance criteria: none". Both directions are pinned here, then the whole frozen
// export is checked for the invariant that no text is dropped or merged.
//
// Standalone: `bun agent/skills/backlog-conventions/scripts/import-linear.test.ts`.
// Nothing here runs the CLI or writes files.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { splitCriteria } from "./import-linear.ts";

type Expect = { description: string; ac: string[]; dod?: string[] };
const cases: [name: string, input: string, expect: Expect][] = [
	["heading + list", "Intro\n\n## Acceptance\n\n- one\n- two", { description: "Intro", ac: ["one", "two"] }],
	["checkbox list, CRLF", "## Acceptance Criteria\r\n- [ ] one\r\n- [x] two", { description: "", ac: ["one", "two"] }],
	["indented continuation joins its bullet", "## Acceptance\n- one\n  more of one\n- two", { description: "", ac: ["one more of one", "two"] }],
	["nested bullet joins its parent", "## Acceptance\n- one\n  - sub\n- two", { description: "", ac: ["one - sub", "two"] }],
	["blank lines between bullets stay in the list", "## Acceptance\n- one\n\n- two", { description: "", ac: ["one", "two"] }],
	["prose after the list stays in the description (SOLO-236 shape)",
		"## Acceptance\n- one\n- two\n\nRelated to SOLO-233.", { description: "Related to SOLO-233.", ac: ["one", "two"] }],
	["unindented line right after a bullet ends the list",
		"## Acceptance\n- one\nUse flags in prose.", { description: "Use flags in prose.", ac: ["one"] }],
	["leading paragraph is one item, then the list", "## Acceptance\nSome prose.\n\n- a\n- b", { description: "", ac: ["Some prose.", "a", "b"] }],
	["paragraph-only block ends at the blank line", "## Done when\nIt passes,\nand holds.\n\nAfter.", { description: "After.", ac: ["It passes, and holds."] }],
	["same-level heading ends the block", "## Acceptance\n- a\n## Notes\nkeep", { description: "## Notes\nkeep", ac: ["a"] }],
	["bold block ends at a bold-led line", "**Acceptance**\n- x\n\n**Evidence of done (beyond unit tests)**\n- z\n\n**Lane:** pre",
		{ description: "**Lane:** pre", ac: ["x"], dod: ["z"] }],
	["inline bold form, continuation lines join", "Intro\n\n**Done when:** a passes,\nand b holds.\n\nTail", { description: "Intro\n\nTail", ac: ["a passes, and b holds."] }],
	["inline Acceptance. form", "**Acceptance.** `bun test` green.", { description: "", ac: ["`bun test` green."] }],
	["definition of done goes to dod", "## Definition of done\n- shipped", { description: "", ac: [], dod: ["shipped"] }],
	["heading inside a code fence is text", "```md\n## Acceptance\n- not a criterion\n```\nAfter",
		{ description: "```md\n## Acceptance\n- not a criterion\n```\nAfter", ac: [] }],
	["a fence ends the list", "## Acceptance\n- a\n```\ncode\n```", { description: "```\ncode\n```", ac: ["a"] }],
	["empty bullet is dropped", "## Acceptance\n- good one\n- ", { description: "", ac: ["good one"] }],
	["heading with nothing under it stays", "## Acceptance\n\n## Next\nx", { description: "## Acceptance\n\n## Next\nx", ac: [] }],
	["no criteria: untouched", "Just a description.\n\n- a list that is not criteria", { description: "Just a description.\n\n- a list that is not criteria", ac: [] }],
];

let fail = 0;
for (const [name, input, want] of cases) {
	const got = splitCriteria(input);
	const ok =
		got.description === want.description &&
		JSON.stringify(got.ac) === JSON.stringify(want.ac) &&
		JSON.stringify(got.dod) === JSON.stringify(want.dod ?? []);
	if (!ok) fail++;
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      got ${JSON.stringify(got)}\n     want ${JSON.stringify({ dod: [], ...want })}`}`);
}

// Invariant over the frozen export: every source line's text lands in the description or
// in exactly one item, and no criteria heading outside a fence is left in a description.
const exportPath = join(import.meta.dir, "..", "..", "..", "..", "backlog", "linear-export.json");
if (existsSync(exportPath)) {
	const all: { id: string; description?: string | null }[] = JSON.parse(readFileSync(exportPath, "utf-8"));
	const MARKER = /^(?:#{1,6}\s*|\*\*)(acceptance|done when|definition of done|evidence of done)/i;
	const strip = (l: string) => l.trim().replace(/^ ?(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/, "").trim();
	let lost = 0, merged = 0, leftover = 0, withCriteria = 0;
	for (const issue of all) {
		const src = (issue.description ?? "").trim();
		const s = splitCriteria(src);
		if (s.ac.length || s.dod.length) withCriteria++;
		const out = [s.description, ...s.ac, ...s.dod];
		let inFence = false;
		for (const raw of s.description.split("\n")) {
			if (/^\s{0,3}(```|~~~)/.test(raw)) inFence = !inFence;
			if (!inFence && /^(?:#{1,6}\s*)(acceptance|done when|definition of done|evidence of done)\b/i.test(raw.trim())) {
				leftover++;
				console.log(`FAIL  ${issue.id}: criteria heading left in description: ${raw.trim()}`);
			}
		}
		for (const line of src.split(/\r?\n/)) {
			const t = strip(line);
			if (!t || MARKER.test(line.trim())) continue;
			if (!out.some((o) => o.includes(t))) {
				lost++;
				console.log(`FAIL  ${issue.id}: line lost: ${t.slice(0, 80)}`);
			}
		}
		// A criterion never spans a blank line in its source unless it is a bullet's continuation.
		for (const item of [...s.ac, ...s.dod]) {
			if (/\bRelated to\b|\bDepends on\b|^---| --- /.test(item)) {
				merged++;
				console.log(`FAIL  ${issue.id}: item absorbed trailing text: ${item.slice(-80)}`);
			}
		}
	}
	const ok = lost === 0 && merged === 0 && leftover === 0;
	if (!ok) fail++;
	console.log(`${ok ? "PASS" : "FAIL"}  export invariant over ${withCriteria} tickets with criteria (lost ${lost}, merged ${merged}, heading left ${leftover})`);
} else {
	console.log(`SKIP  export invariant: no ${exportPath}`);
}

const total = cases.length + 1;
console.log(`\n${total - fail}/${total} passed`);
if (fail) process.exit(1);
