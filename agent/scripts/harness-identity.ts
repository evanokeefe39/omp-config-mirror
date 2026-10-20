/**
 * harness-identity — the ONE computation of WHICH harness did a piece of work.
 *
 * Two surfaces need the same answer, and a second copy of the format would drift,
 * so this file is the only one:
 *
 *   - `agent/extensions/omp-identity.ts` runs `collectIdentity` at `session_start`
 *     and exports the result as `OMP_IDENTITY`, which
 *     `agent/scripts/git-hooks/prepare-commit-msg` writes as the `Agent-Identity:`
 *     trailer on every agent commit.
 *   - this file, run as a script, prints the same value for a caller that has to
 *     put it somewhere else: `pb-land` records it on the card it sets `Done`
 *     (`agent/skills/pb-land/todo.json`, `skill://backlog-conventions`).
 *
 * `bun agent/scripts/harness-identity.ts` prints the current session's identity —
 * the value the extension stamped, so it names the harness the work ran under —
 * or, with `OMP_IDENTITY` unset, resolves one from the harness checkout this file
 * lives in, which is the path a scratch clone, a CI job or a human takes. A stamp
 * that predates this file's `commit=` fact is reported and exits non-zero rather
 * than completed from this checkout, which may be a tree the session never ran in
 * (see `main`).
 *
 * The value is a SIGNAL, not provenance: one line, safe in a git trailer and in a
 * task file, `unknown` for a fact that could not be resolved and never a guess.
 * Five space-separated `key=value` facts:
 *
 *   harness  `git describe --tags --dirty --always` in the harness checkout,
 *            folded to the release a reader can open: `omp-config-mirror@<tag>`,
 *            `+N` when the tree is N commits past the tag, `-dirty` when it is
 *            modified, and `@untagged-<sha>` when no tag is reachable — a bare
 *            sha must not read as a release. An unresolvable describe is
 *            `unknown`, not a URL that names nothing.
 *   commit   `git rev-parse --short=12 HEAD`: the EXACT harness commit, whichever
 *            branch or worktree it was resolved from. A dirty tree appends
 *            `-dirty-<hash>`, `<hash>` being the first 8 hex of the sha256 of
 *            `git diff HEAD` (staged and unstaged tracked changes), so two trees
 *            carrying the same changes share an identity and a different edit
 *            does not; `-dirty-unknown` when the diff could not be read.
 *            Untracked files are not part of it, matching `git describe --dirty`.
 *   omp      `omp --version`, its `omp/` prefix dropped.
 *   model    `provider/id` of the session's model.
 *   session  the session id, which locates the transcript.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Every subprocess is local and fast; a hung one must not hold up the caller. */
const COMMAND_TIMEOUT_MS = 5_000;

/** `git diff HEAD` is read whole to be hashed; this only bounds a pathological one. */
const DIFF_MAX_BYTES = 64 * 1024 * 1024;

// <repo>/agent/scripts/harness-identity.ts -> <repo>. Taken from this file rather
// than the caller's cwd, so a harness checked out anywhere — a worktree, a scratch
// clone — describes the tree it is actually in.
export const HARNESS_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** What a command produced. `code` is -1 when it could not be run at all. */
export interface ExecResult {
	stdout: string;
	code: number;
}

/**
 * Run a command and return its full stdout with its exit code. It never throws,
 * so a caller keeps the facts it could resolve and stamps `unknown` for the rest
 * instead of losing the identity to one broken source.
 */
export type Exec = (command: string, args: string[]) => Promise<ExecResult>;

/** The five facts, already folded to trailer-safe tokens. */
export interface IdentityFacts {
	harness: string;
	commit: string;
	omp: string;
	model: string;
	session: string;
}

/**
 * Fold a fact into one trailer-safe token: no newlines, and no whitespace that
 * would split the space-separated `key=value` parts. An unresolvable fact is
 * `unknown` — a stable word a reader can filter on, never a guess.
 */
function stampPart(value: string | undefined): string {
	const folded = (value ?? "").trim().replace(/\s+/g, "_");
	return folded.length > 0 ? folded : "unknown";
}

/** The first non-empty stdout line of a command that succeeded, else `undefined`. */
function firstLine(result: ExecResult): string | undefined {
	if (result.code !== 0) return undefined;
	const line = result.stdout.trim().split(/\r?\n/)[0]?.trim() ?? "";
	return line.length > 0 ? line : undefined;
}

/**
 * `git describe` output as the release a reader can open. The harness repo is
 * private, so a bare tag names nothing: each release publishes the mechanism to
 * the mirror (`agent/scripts/mirror-config.sh`, `.github/workflows/mirror-config.yml`),
 * and the identity names that repo plus the tag, saying plainly when the tree it
 * ran from was ahead of the release rather than implying the tag contains the work.
 */
function harnessPart(described: string | undefined): string {
	const value = stampPart(described);
	if (value === "unknown") return value;
	const ahead = /^(.*)-(\d+)-g[0-9a-f]+(-dirty)?$/.exec(value);
	if (ahead) return `omp-config-mirror@${ahead[1]}+${ahead[2]}${ahead[3] ? "-dirty" : ""}`;
	if (/^[0-9a-f]{7,}(-dirty)?$/.test(value)) return `omp-config-mirror@untagged-${value}`;
	return `omp-config-mirror@${value}`;
}

/**
 * The exact commit, plus the working tree's own fingerprint when it is dirty:
 * `diff` is present exactly when the tree is dirty, and is the `git diff HEAD`
 * whose content is hashed.
 */
function commitPart(sha: string | undefined, diff: ExecResult | undefined): string {
	const commit = stampPart(sha);
	if (commit === "unknown" || !diff) return commit;
	const hash = diff.code === 0 ? createHash("sha256").update(diff.stdout).digest("hex").slice(0, 8) : undefined;
	return `${commit}-dirty-${hash ?? "unknown"}`;
}

/**
 * Resolve the five facts. `repo` is the harness checkout to describe; `model` and
 * `session` come from the caller, which is the only surface that knows them.
 */
export async function collectIdentity(
	exec: Exec,
	repo: string,
	model: string,
	session: string,
): Promise<IdentityFacts> {
	// The running binary answers for itself: `omp update` replaces it in place, so
	// this stays correct across an update without consulting PATH. Under `bun run`
	// execPath is bun, which would answer with the wrong version, so it is used only
	// when its own name says omp; PATH's `omp` is the fallback.
	const omp = /^omp(\.exe)?$/i.test(basename(process.execPath)) ? process.execPath : "omp";

	const [described, sha, status, version] = await Promise.all([
		exec("git", ["-C", repo, "describe", "--tags", "--dirty", "--always"]),
		exec("git", ["-C", repo, "rev-parse", "--short=12", "HEAD"]),
		exec("git", ["-C", repo, "status", "--porcelain", "--untracked-files=no"]),
		exec(omp, ["--version"]),
	]);

	// `status --porcelain` prints one line per modified tracked path, so any output
	// is the same dirty signal `git describe --dirty` uses; the diff it fingerprints
	// is read only when there is one.
	const dirty = status.code === 0 && status.stdout.trim().length > 0;
	const diff = dirty ? await exec("git", ["-C", repo, "diff", "HEAD"]) : undefined;

	return {
		harness: harnessPart(firstLine(described)),
		commit: commitPart(firstLine(sha), diff),
		// `omp --version` prints "omp/18.6.0"; the key already says which tool this
		// is, so the prefix is dropped. Anything else is kept verbatim.
		omp: (firstLine(version) ?? "").replace(/^omp\//, ""),
		model,
		session,
	};
}

/** The identity's value: the five facts as one trailer-safe string. */
export function buildIdentity(facts: IdentityFacts): string {
	return [
		`harness=${stampPart(facts.harness)}`,
		`commit=${stampPart(facts.commit)}`,
		`omp=${stampPart(facts.omp)}`,
		`model=${stampPart(facts.model)}`,
		`session=${stampPart(facts.session)}`,
	].join(" ");
}

/** A fact that could not be resolved reads as `unknown`, which is not an identity. */
const UNRESOLVED_HARNESS = /(?:^| )harness=unknown(?: |$)/;
const UNRESOLVED_COMMIT = /(?:^| )commit=unknown(?: |$)/;

/** Run a command for the script's own resolution; a failure is reported, not thrown. */
const scriptExec: Exec = async (command, args) => {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		timeout: COMMAND_TIMEOUT_MS,
		maxBuffer: DIFF_MAX_BYTES,
	});
	if (result.error || result.status === null) {
		console.error(`harness-identity: ${command} ${args.join(" ")} did not run: ${result.error?.message ?? "killed"}`);
		return { stdout: "", code: -1 };
	}
	return { stdout: result.stdout ?? "", code: result.status };
};

/**
 * Print the identity on stdout and nothing else — it is pasted into a task file.
 *
 * Exit 0 with every load-bearing fact resolved, 1 when `harness` or `commit`
 * says `unknown`: a stamp that says nothing must not read as a stamp that says
 * something. The value is printed either way, so a caller can record what it got
 * and say so.
 *
 * A session whose `OMP_IDENTITY` carries no `commit=` was stamped by an extension
 * older than this file. That value is reported rather than completed: filling the
 * fact in from this checkout would name a tree the session may not have run in,
 * and a stamp that silently names the wrong harness is worse than a stamp that
 * says it is stale. Restarting the session is the fix.
 */
async function main(): Promise<void> {
	try {
		const fromSession = process.env.OMP_IDENTITY?.trim() ?? "";
		if (fromSession.length > 0 && !/(?:^| )commit=\S/.test(fromSession)) {
			console.log(fromSession);
			console.error(
				"harness-identity: the session's stamp carries no `commit=` — it was set by an extension older than this one. Restart the session so the current extension stamps it; do not record this value",
			);
			process.exitCode = 1;
			return;
		}
		const identity =
			fromSession.length > 0
				? fromSession
				: buildIdentity(await collectIdentity(scriptExec, HARNESS_REPO, "unknown", "unknown"));
		console.log(identity);
		if (UNRESOLVED_HARNESS.test(identity) || UNRESOLVED_COMMIT.test(identity)) {
			console.error(
				"harness-identity: the harness release or the exact commit could not be resolved — the value above carries `unknown` where a fact is missing",
			);
			process.exitCode = 1;
		}
	} catch (err) {
		console.error(`harness-identity: could not resolve an identity: ${String(err)}`);
		process.exitCode = 1;
	}
}

if (import.meta.main) void main();
