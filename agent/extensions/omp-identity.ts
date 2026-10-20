/**
 * omp-identity — stamp WHICH agent did the work.
 *
 * At `session_start` this resolves the session's identity with
 * `agent/scripts/harness-identity.ts` — the ONE computation of that value, shared
 * with `pb-land`, which records it on the card it sets `Done` — and exports it as
 * `OMP_IDENTITY` in `process.env`, so every shell the session spawns inherits it.
 * `agent/scripts/git-hooks/prepare-commit-msg` (the copy installed under
 * `core.hooksPath`) turns that into an `Agent-Identity:` git trailer, and
 * `agent/scripts/omp-identity-rollup.sh` collects the values on a branch for a PR
 * body. The facts and the format are documented in that module.
 *
 * This file is the thin adapter: it knows what the session's model and id are,
 * which no other surface does, and it runs commands through `pi.exec`. Three
 * consequences worth knowing:
 *
 *   - `process.env` is process-wide, so when one process hosts several sessions
 *     (subagents) the most recent `session_start` wins. Drift is expected here.
 *   - Everything is best-effort and fail-open. A missing stamp degrades a
 *     trailer; a thrown handler would degrade the session, so every failure is
 *     logged and swallowed.
 *   - A command that fails is logged rather than thrown, so the identity keeps
 *     the facts it could resolve and says `unknown` for the rest.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { buildIdentity, collectIdentity, HARNESS_REPO } from "../scripts/harness-identity.ts";
import type { Exec } from "../scripts/harness-identity.ts";

/** Both subprocesses are local and fast; a hung one must not hold up session start. */
const VERSION_TIMEOUT_MS = 5_000;

export default function ompIdentity(pi: ExtensionAPI) {
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

			const exec: Exec = async (command, args) => {
				try {
					const result = await pi.exec(command, args, { cwd: ctx.cwd, timeout: VERSION_TIMEOUT_MS });
					if (result.killed || result.code !== 0) {
						pi.logger.warn("omp-identity: identity command failed", {
							command,
							args,
							code: result.code,
							stderr: result.stderr.trim().slice(0, 500),
						});
					}
					return { stdout: result.stdout, code: result.killed ? -1 : result.code };
				} catch (err) {
					pi.logger.warn("omp-identity: identity command threw", { command, args, error: String(err) });
					return { stdout: "", code: -1 };
				}
			};

			const identity = buildIdentity(await collectIdentity(exec, HARNESS_REPO, model, session));

			process.env.OMP_IDENTITY = identity;
			pi.logger.info("omp-identity: stamped session identity", { identity, harnessRepo: HARNESS_REPO });
		} catch (err) {
			pi.logger.warn("omp-identity: stamping failed", { error: String(err) });
		}
	});
}
