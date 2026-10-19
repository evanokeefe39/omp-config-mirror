/**
 * boundary-gate — E7 as enforcement: "validation runs against real data, not only
 * fixtures."
 *
 * This is the guarantee that describes the enrichment-v3 failure class and that
 * no phase of the harness program wired. The migration did not die of a dropped
 * table; it died of mocks whose envelope shape did not match production, standing
 * in for the boundary that was supposed to be under test.
 *
 * Scope is deliberately narrow, because a gate that false-blocks is worse than
 * no gate. It fires only on a TEST file, and only where the mocking construct's
 * TARGET is a boundary — a pure-function mock passes, a mocked client, adapter,
 * session or endpoint is the anti-pattern and is blocked.
 *
 * THERE IS NO ESCAPE HATCH, deliberately. An earlier revision honoured
 * `boundary-mock-ok: <reason>` in the file; that is removed. A guard the
 * constrained actor can lift is not a guard — the agent writing the test is the
 * agent being checked, so a waiver written by it authorises its own exception.
 * The escape was only ever needed because the matcher was imprecise (it fired on
 * any line merely CONTAINING a boundary word near a mock); that imprecision is
 * fixed here instead. If the gate blocks something genuinely correct, the remedy
 * is to improve the matcher or change the code, never to waive the check.
 */

const RECORD_TYPE = "dev.omp.harness.guard-block";

/** Test surfaces across the languages this harness actually writes. */
const TEST_PATH = /(^|[\\/])(tests?|__tests__)([\\/]|$)|(^|[\\/])test_[^\\/]*\.py$|_test\.py$|conftest\.py$|\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/i;

/**
 * Word boundaries here are `(?<![A-Za-z0-9])` / `(?![A-Za-z0-9])`, never `\b`.
 *
 * Two separate bugs came from `\b` in this file, both invisible until the gate
 * was run against a real mocked boundary:
 *   1. `\b` after an alternative ending in `(` never matches, so `patch(` did
 *      not trip the gate at all.
 *   2. `_` IS a word character to `\b`, so `\bhttp\b` does not match
 *      `http_client` and `\bclient\b` fails because `_` precedes it. Every
 *      snake_case boundary name — which is most of them — was missed.
 * These alnum-only guards treat `_` as a separator, which is what a boundary
 * name actually needs, while still refusing `api` inside `capital`.
 */
const MOCK =
	/(?<![A-Za-z0-9])(patch\(|MagicMock|AsyncMock|mock\.patch|mocker\.patch|monkeypatch\.setattr|unittest\.mock|jest\.mock\(|vi\.mock\(|sinon\.stub|jest\.spyOn|vi\.spyOn)(?![A-Za-z0-9])/;

/** The boundary kinds E7 requires to be real rather than faked. */
const BOUNDARY =
	/(?<![A-Za-z0-9])(client|adapter|connector|gateway|transport|http|https|s3|minio|db|database|sqlite|duckdb|postgres|session|redis|queue|broker|kafka|api|endpoint|provider)(?![A-Za-z0-9])/i;

/**
 * The same kinds, matched INSIDE a CamelCase symbol.
 *
 * A `spec=` target is a class or symbol, not a dotted path: `spec=RedisClient`
 * and `spec=DbAdapter` name boundaries, but `BOUNDARY`'s alnum boundaries refuse
 * them (there is no `\b` between `Redis` and `Client`). So a spec target is
 * tested case-insensitively for the kind as a substring, which is the only form
 * that catches `RedisClient` without also firing on `mock_adapter_helper`.
 */
const BOUNDARY_IN_SYMBOL =
	/(client|adapter|connector|gateway|transport|http|https|minio|database|sqlite|duckdb|postgres|session|redis|queue|broker|kafka|endpoint|provider)/i;

/** The forms that name a mock TARGET rather than merely appearing on the line. */
const PATCH_STRING_TARGET =
	/(?:patch\.object|mock\.patch|mocker\.patch|monkeypatch\.setattr|patch|jest\.mock|vi\.mock)\s*\(\s*[^,)]*?["'`]([^"'`]+)["'`]/;

/** `spec=` / `spec_set=` / `wraps=` name what a MagicMock/AsyncMock stands in for. */
const MOCK_SPEC_TARGET = /(?:MagicMock|AsyncMock)\s*\([^)]*?(?:spec_set|spec|wraps)\s*=\s*([A-Za-z_][\w.]*)/;

/**
 * Decide whether a line fakes a BOUNDARY, as opposed to merely mentioning one.
 *
 * The first version tested the whole line for a boundary word, which fires on a
 * comment, a URL, or a helper named `mock_adapter_helper`. This tests the mock's
 * TARGET instead, and treats the two target shapes differently:
 *
 *   - a DOTTED string target (`patch("proj.client.fetch")`) is split and each
 *     segment is tested with alnum boundaries — so `fetch` is judged as itself,
 *     and `proj.client` fires on `client`.
 *   - a SYMBOL target (`spec=RedisClient`) is a single CamelCase name, tested by
 *     substring — there is no word boundary inside `RedisClient`.
 *
 * Edge case inventory (the false positives the line-scan produced):
 *   - `mock_adapter_helper()`            → no target form            → no fire
 *   - a docstring/URL containing `http`  → no target form            → no fire
 *   - `patch("proj.pure_fn")`            → target `pure_fn`          → no fire
 *   - `patch("proj.client.fetch")`       → segment `client`          → fires
 *   - `MagicMock(spec=AdapterFactory)`   → symbol `AdapterFactory`   → fires
 *   - `MagicMock()`                      → no spec kwargs            → no fire
 */
function fakesBoundary(line: string): boolean {
	if (!MOCK.test(line)) return false;

	const dotted = PATCH_STRING_TARGET.exec(line)?.[1];
	if (dotted) {
		return dotted.split(/[.:/]/).filter(Boolean).some((seg) => BOUNDARY.test(seg));
	}

	const symbol = MOCK_SPEC_TARGET.exec(line)?.[1];
	if (symbol) {
		const last = symbol.split(/[.:/]/).filter(Boolean).pop() ?? symbol;
		return BOUNDARY_IN_SYMBOL.test(last);
	}

	return false;
}

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
		const pathStrings: string[] = [];
		collectStrings(input.path ?? input.file_path ?? input.filePath, pathStrings);
		const path = pathStrings[0] ?? "";
		if (!TEST_PATH.test(path)) return;

		const strings: string[] = [];
		collectStrings(input, strings);
		const text = strings.join("\n");

		const offender = text
			.split("\n")
			.map((line) => line.trim())
			.find((line) => fakesBoundary(line));
		if (!offender) return;

		pi.appendEntry(RECORD_TYPE, {
			guard: "qa-codified-every-layer/E7",
			path,
			line: offender.slice(0, 240),
			cwd: ctx.cwd,
			at: new Date().toISOString(),
		});

		return {
			block: true,
			reason:
				`A test is mocking a boundary: ${path}\n    ${offender.trim().slice(0, 200)}\n` +
				`E7 — validation must run against real data, not only fixtures. A mock standing in for a ` +
				`client/adapter/session/endpoint is how a migration passes every test and still cannot run: ` +
				`the mock's shape drifts from production and nothing notices. ` +
				`Exercise the real path. This check has no waiver: a guard the agent being checked can ` +
				`lift is not a guard. If it is wrong about this line, say so — the matcher is what gets fixed.`,
		};
	});
}
