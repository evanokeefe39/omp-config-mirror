/**
 * omp-identity — stamp WHICH agent did the work.
 *
 * At `session_start` this resolves four facts about the session that is starting
 *
 *   harness  `git describe --tags --dirty --always` in the repo this file lives
 *            in, so a session run from a worktree describes that worktree
 *   omp      the version of the running binary, read from the binary itself
 *   model    `provider/id` of the session's current model
 *   session  the session id, which locates the transcript
 *
 * and exports them as `OMP_IDENTITY` in `process.env`, so every shell the
 * session spawns inherits it. `agent/scripts/git-hooks/prepare-commit-msg` (the
 * copy installed under `core.hooksPath`) turns that into an `Agent-Identity:`
 * git trailer, and `agent/scripts/omp-identity-rollup.sh` collects the values on
 * a branch for a PR body.
 *
 * This is a SIGNAL, not provenance: it answers "which harness/omp/model produced
 * this commit" well enough to compare what works, and it deliberately does not
 * try to be exact. Three consequences worth knowing:
 *
 *   - The value is one line and safe in a git trailer; a fact that cannot be
 *     resolved is stamped `unknown`. It is never guessed, and never invented.
 *   - `process.env` is process-wide, so when one process hosts several sessions
 *     (subagents) the most recent `session_start` wins. Drift is expected here.
 *   - Everything is best-effort and fail-open. A missing stamp degrades a
 *     trailer; a thrown handler would degrade the session, so every failure is
 *     logged and swallowed.
 */
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

/** Both subprocesses are local and fast; a hung one must not hold up session start. */
const VERSION_TIMEOUT_MS = 5_000;

// <repo>/agent/extensions/omp-identity.ts -> <repo>. Taken from this file rather
// than the cwd so that an extension loaded out of a worktree (via
// PI_CODING_AGENT_DIR) describes that worktree, not wherever the session runs.
const HARNESS_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Fold a fact into one trailer-safe token: no newlines, and no whitespace that
 * would split the space-separated `key=value` parts. An unresolvable fact is
 * `unknown` — a stable word a reader can filter on, never a guess.
 */
function stampPart(value: string | undefined): string {
	const folded = (value ?? "").trim().replace(/\s+/g, "_");
	return folded.length > 0 ? folded : "unknown";
}

/**
 * Run a command and return its first stdout line, or `undefined` when it fails,
 * is killed, or says nothing. Callers stamp `unknown` for `undefined`; a failure
 * is logged so a broken source is visible in ~/.omp/logs rather than silent.
 */
async function firstStdoutLine(
	pi: ExtensionAPI,
	command: string,
	args: string[],
	cwd: string,
): Promise<string | undefined> {
	try {
		const result = await pi.exec(command, args, { cwd, timeout: VERSION_TIMEOUT_MS });
		if (result.killed || result.code !== 0) {
			pi.logger.warn("omp-identity: version command failed", {
				command,
				args,
				code: result.code,
				stderr: result.stderr.trim().slice(0, 500),
			});
			return undefined;
		}
		const line = result.stdout.trim().split(/\r?\n/)[0]?.trim() ?? "";
		return line.length > 0 ? line : undefined;
	} catch (err) {
		pi.logger.warn("omp-identity: version command threw", { command, args, error: String(err) });
		return undefined;
	}
}

export default function ompIdentity(pi: ExtensionAPI) {
	// The running binary answers for itself: `omp update` replaces it in place, so
	// this stays correct across an update without consulting PATH. Under `bun run`
	// execPath is bun, which would answer with the wrong version, so it is used
	// only when its own name says omp; PATH's `omp` is the fallback.
	const ompCommand = /^omp(\.exe)?$/i.test(basename(process.execPath)) ? process.execPath : "omp";

	pi.on("session_start", async (_event, ctx) => {
		try {
			let model = "unknown";
			let session = "unknown";
			try {
				const current = ctx.model;
				if (current) model = `${current.provider}/${current.id}`;
				const sessionId = ctx.sessionManager.getSessionId();
				if (sessionId) session = sessionId;
			} catch (err) {
				pi.logger.warn("omp-identity: reading session context failed", { error: String(err) });
			}

			const [harness, omp] = await Promise.all([
				firstStdoutLine(pi, "git", ["-C", HARNESS_REPO, "describe", "--tags", "--dirty", "--always"], ctx.cwd),
				firstStdoutLine(pi, ompCommand, ["--version"], ctx.cwd),
			]);

			// The harness repo is PRIVATE, so a bare `omp-home-v0.5.0` names nothing a
			// reader can open. The tag is published to the mirror at each release
			// (`agent/scripts/mirror-config.sh`, `.github/workflows/mirror-config.yml`),
			// so the identity names that URL instead — private too, until OMP-26
			// re-publicises the mirror — and says plainly when the tree it ran from was
			// ahead of the release, rather than implying the tag.
			// `git describe --always` falls back to a bare sha when no tag is
			// reachable; that must not read as a release, so it is marked `@untagged`.
			const described = stampPart(harness);
			const ahead = /^(.*)-(\d+)-g[0-9a-f]+(-dirty)?$/.exec(described);
			const untagged = /^[0-9a-f]{7,}(-dirty)?$/.test(described);
			const harnessPart = ahead
				? `omp-config-mirror@${ahead[1]}+${ahead[2]}${ahead[3] ? "-dirty" : ""}`
				: untagged
					? `omp-config-mirror@untagged-${described}`
					: `omp-config-mirror@${described}`;

			// `omp --version` prints "omp/18.6.0"; the key already says which tool
			// this is, so the prefix is dropped. Anything else is kept verbatim.
			const identity = [
				`harness=${harnessPart}`,
				`omp=${stampPart(omp?.replace(/^omp\//, ""))}`,
				`model=${stampPart(model)}`,
				`session=${stampPart(session)}`,
			].join(" ");

			process.env.OMP_IDENTITY = identity;
			pi.logger.info("omp-identity: stamped session identity", {
				identity,
				harnessRepo: HARNESS_REPO,
				ompCommand,
			});
		} catch (err) {
			pi.logger.warn("omp-identity: stamping failed", { error: String(err) });
		}
	});
}
