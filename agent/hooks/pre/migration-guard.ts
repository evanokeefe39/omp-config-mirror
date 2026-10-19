/**
 * migration-guard — the documented-incident guard.
 *
 * The one rule in the catalog with a data-loss incident behind it: a migration
 * containing `DROP TABLE IF EXISTS listings` destroyed 391 real scraped rows.
 * This is the first hook in the harness, and its job is to prove the enforcement
 * plane exists at all — everything else is advice until something can fail
 * closed.
 *
 * It blocks only destructive DDL on a migration path. Additive migrations pass
 * untouched, which is the whole point of the rule it enforces.
 *
 * The block is RECORDED before it is returned. A hook that silently prevents a
 * catastrophe leaves no trace, so the harness's best outcome would be invisible
 * — and invisible prevention is the defect this project's andon rule names.
 */

/** Reverse-domain namespace; `custom` customTypes are global and core reserves some. */
const RECORD_TYPE = "dev.omp.harness.guard-block";

/** A migration path, by directory convention or SQL extension. */
const MIGRATION_PATH = /(^|[\\/])(migrations?|alembic|versions)([\\/]|$)|\.sql$/i;

/** Destructive DDL. Additive statements are deliberately absent. */
const DESTRUCTIVE = /\b(DROP\s+(TABLE|COLUMN|SCHEMA|DATABASE|INDEX)|TRUNCATE\s+TABLE)\b/i;

interface ToolCallEvent {
	toolName?: string;
	input?: Record<string, unknown>;
}

interface HookContext {
	cwd?: string;
}

interface HookApi {
	on(name: "tool_call", handler: (event: ToolCallEvent, ctx: HookContext) => unknown): void;
	appendEntry(customType: string, data: unknown): void;
}

/** Collect every string in the call, so the check does not depend on which arg key a tool uses. */
function collectStrings(value: unknown, out: string[], depth = 0): void {
	if (depth > 6 || value === null || value === undefined) return;
	if (typeof value === "string") {
		out.push(value);
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectStrings(item, out, depth + 1);
		return;
	}
	if (typeof value === "object") {
		for (const item of Object.values(value)) collectStrings(item, out, depth + 1);
	}
}

export default function (pi: HookApi): void {
	pi.on("tool_call", (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return;

		const input = event.input ?? {};
		const paths: string[] = [];
		collectStrings(input.path ?? input.file_path ?? input.filePath, paths);
		const path = paths[0] ?? "";
		if (!MIGRATION_PATH.test(path)) return;

		const strings: string[] = [];
		collectStrings(input, strings);
		const text = strings.join("\n");

		const match = DESTRUCTIVE.exec(text);
		if (!match) return;

		pi.appendEntry(RECORD_TYPE, {
			guard: "migration-ships-with-code",
			path,
			matched: match[0],
			cwd: ctx.cwd,
			at: new Date().toISOString(),
		});

		return {
			block: true,
			reason:
				`Destructive DDL (${match[0]}) on a migration path: ${path}. ` +
				`rule://migration-ships-with-code — prefer additive DDL; this pattern has destroyed real production data before. ` +
				`The attempt is recorded as ${RECORD_TYPE}.`,
		};
	});
}
