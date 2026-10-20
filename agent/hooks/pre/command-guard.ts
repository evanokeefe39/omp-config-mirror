/**
 * command-guard — the cross-repo conventions, enforced instead of requested.
 *
 * Five constraints appear verbatim in AGENTS.md across nearly every repo: no pip,
 * no PowerShell, no direct push to main, conventional commits, branch naming —
 * and the practice behind them, that work happens on a branch named for the
 * task's `kind` label (`bugfix/`, `feature/`, `docs/`, …) and never directly on
 * main. The full prefix set, the commit-type prefixes still accepted beside it
 * and the retired `release/` are stated at BRANCH_OK below.
 *
 * Until now they were prose in N repos plus two TTSR rules living in
 * `~/.omp/rules/`, a directory OMP does not load. So they had no enforcement and,
 * on the bash surface, no guidance either. This hook is global: the convention is
 * stated once and enforced in every repo, for the main session.
 *
 * SUBAGENT COVERAGE: PROBED, AND IT DOES REACH DELEGATED WORK. A dispatched
 * subagent running `pip install` is blocked here, with this hook's reason text,
 * for both `task` (no `tools:` list) and `implementer` (explicit `tools:` list),
 * and with the matching TTSR rule's interruptMode set to both `always` and
 * `never`. A block reaches subagents even though they are forced to yolo.
 *
 * EARLIER EVIDENCE, UNEXPLAINED: two earlier probes of the same thing showed the
 * command RUNNING unblocked, and I concluded and published the opposite of the
 * above. I could not reproduce that, and I will not invent a cause for it. Only
 * the repeated current measurement is stated here.
 *
 * POSITIVE CONTROL, BOTH BRANCHES. A block only proves the handler was entered
 * when it denied — it cannot distinguish "handler absent" from "handler ran and
 * allowed". So a second probe used the escape hatch as it existed at the time: a
 * subagent ran the banned command with `guard-ok:` appended, the command
 * proceeded, and a `dev.omp.harness.guard-suppression` record appeared in that
 * subagent's own session file. Handler entry was therefore witnessed on the allow
 * path as well as the block path, which closed the gap. Both probes ran with cwd
 * outside any repo, so cwd is not the variable.
 *
 * That same probe is what killed the hatch. It proved a marker the checked agent
 * writes is honoured, and on 2026-09-16 `guard-ok: bootstrap` was appended twice
 * to push to main. The allow path is now gone, so a future positive control must
 * use a different method — e.g. asserting the handler was entered via its
 * `guard-block` record on a command that is blocked.
 *
 * KNOWN FALSE POSITIVE: matching is a substring test over the whole command, so a
 * heredoc or doc that merely MENTIONS the banned phrase is blocked. Observed live
 * while writing documentation about this hook. The structural view now reads the
 * command as a program — quoted spans and heredoc bodies are data, and a text hit
 * is dropped only when every segment is understood — which fixed the recorded
 * instances; the allowances that remain are listed, one literal command each, in
 * `hooks/pre/__tests__/fixtures/false-positive-families.md`.
 *
 * WHY A HOOK AND NOT ONLY A RULE
 * A rule shapes the first attempt; a hook stops an act already intended. Every
 * block reason below carries the POSITIVE instruction — "use `uv add`", "create a
 * branch first" — so an agent that never read the rule is corrected at the point
 * of failure instead of left to guess, and cannot spiral into retry variants
 * (pip -> pip3 -> python -m pip).
 *
 * MERGE GATE (OMP-9 AC3, added 2026-10-19). `gh pr merge` and `gh stack merge`
 * are refused while any check on the pull request — or, for a stack, on any PR
 * the merge would land — is failing or pending. Nothing else refuses a red
 * merge here: the repo is private on the Free plan, where rulesets and branch
 * protection return 403. The state is read in one `gh api graphql` call. A PR
 * with NO checks at all is allowed (a repo with no CI must stay mergeable), and
 * anything UNVERIFIABLE — an unreachable gh, an unparseable answer, an unknown
 * rollup state, a PR or stack that will not resolve — BLOCKS, because the
 * environment this hook is handed is the one the checked agent controls. Full
 * reasoning, including why `--auto` does not lift the gate: MERGE GATE below.
 *
 * HONEST LIMITS
 * Fires on the `bash` and `eval` tool calls. Not a sandbox: a committed script, a
 * Makefile, an alias, `git -c`, or obfuscated subprocess code can still get
 * through. It enforces intent, not capability — the risk here is the agent doing
 * the ordinary thing, not routing around the guard adversarially.
 *
 * Measured, not assumed: on `eval`, a push whose argv is assembled at runtime
 * (`subprocess.run(["git", "push", "origin", "main"])`) contains no literal
 * `git push` substring, so it is ALLOWED and leaves no record. The matcher is a
 * substring test over the command text; narrowing the main-path override below
 * does not change that. Do not read this guard as "main is unwritable" — read it
 * as "the ordinary way to write to main is refused".
 *
 * Substring caveats, both measured 2026-09-17 while fixing the cwd bug below:
 * (a) matching is over the whole command text, so a string literal or a heredoc
 * naming the protected phrase trips the check — including a diagnostic whose
 * test data merely CONTAINS the phrase; and (b) the cwd a command targets is
 * taken from a leading `cd <path> &&` or `git -C <path>`, resolved WITHOUT a
 * shell, so a `~` is NOT expanded and is handed to git literally. Absolute paths
 * and `/c/...` MSYS paths work; `~` works only where git happens to accept it.
 * A leading-path form not recognised here falls back to ctx.cwd, which can only
 * ever produce a false BLOCK, never a false allow.
 *
 * HOOK EDITS ARE NOT LIVE. A change to this file does not take effect in an
 * already-running session; the session keeps executing the copy it loaded at
 * start. Measured cost, 2026-09-17: after fixing the cwd bug below and verifying
 * it 8/8 on disk, this session went on blocking a legitimate commit with the OLD
 * message, and two retries with different path forms could not distinguish
 * "stale hook" from "fix is broken" — a third probe importing the on-disk module
 * directly was what settled it. Restart, or verify in a fresh process, before
 * concluding a fix failed.
 *
 * TESTS: `hooks/pre/__tests__/` — one suite per check family, all importing this
 * file by RELATIVE path (an absolute path silently tested a different copy
 * whenever a suite ran from a worktree), none of which mutate anything (the hook
 * only reads the command string):
 *   - `command-guard.test.ts`      — the markers: no check honours `guard-ok:`.
 *   - `command-guard-prose.test.ts` — matcher precision: a heredoc body, a
 *                                    hyphenated word, `merge-base`.
 *   - `command-guard-cwd-probe.test.ts` — cwd resolution (`cd`/`-C`/`~`/MSYS), the
 *                                    bootstrap allowance, `git -c k=v` commits.
 *   - `command-guard-chain.test.ts` — the chain-aware branch allowance, and the
 *                                    bypasses it must not open.
 *   - `command-guard-branch.test.ts` — the branch prefixes: the task's kind
 *                                    accepted, `release/` and bare names refused.
 *   - `command-guard-issues.test.ts` — `issues-in-backlog`, both creation routes.
 *   - `command-guard-merge.test.ts` — the merge gate: every rollup state, the
 *                                    unverifiable direction, stacks, `--auto`.
 *   - `guard-e2e-real-git.test.ts`  — real git, no stub: the ordinary command
 *                                    forms against the actual repos.
 * Re-run them all after any edit to this file. Run with `bun run <suite>`.
 *
 * NO ESCAPE HATCH. An earlier revision honoured `guard-ok: <reason>` on the
 * mechanical checks (pip, PowerShell, branch naming), on the theory that a
 * declared way out prevents a guard being silently weakened or deleted. That
 * theory was wrong here, and it is now removed everywhere.
 *
 * On 2026-09-16 the hatch was used twice to push to main, each time with a
 * reason that was true ("no PR is possible against a ref with no commits") and
 * therefore always available — which is the general failure: a marker the
 * constrained actor can write is authorized by that actor, so it constrains
 * nothing. The agent being checked is the agent that would write the waiver.
 *
 * A guard is now a gate. A false block is fixed by narrowing the matcher, not by
 * waiving it; a genuine exception is a human's step at a terminal, not a flag on
 * the agent's command.
 *
 * WORKTREES: branch detection is `git rev-parse --abbrev-ref HEAD`, run in the
 * directory the command actually targets rather than always `ctx.cwd`. A leading
 * `cd <path> &&` or a `git -C <path>` is honoured, because these commands are
 * routinely issued against a repo other than the harness cwd and reading the
 * harness's HEAD blocks the corrected workflow (measured 2026-09-17: a commit in
 * a correctly-branched second repo was refused because the harness cwd sat on
 * main). Anything less explicit falls back to `ctx.cwd`. Inside a linked worktree
 * (`.git` is a file pointing at `<repo>/.git/worktrees/<name>`, and HEAD there is
 * the worktree's own branch) this resolves correctly: measured, not assumed — a
 * worktree on `feat/*` may commit and push its branch; the main checkout stays
 * protected; and an explicit `git push origin main` ISSUED FROM the worktree is
 * still blocked by the check above. Git also refuses to check out `main` in a
 * second worktree while it is checked out elsewhere, so the "isolated worktree
 * silently sitting on main" case does not arise.
 */

const RECORD_TYPE = "dev.omp.harness.guard-block";

interface Check {
	id: string;
	/** Returns the offending fragment, or null. */
	match: (command: string) => string | null;
	reason: string;
}

/** Alnum-only boundaries: `_` and `-` are separators here, never word chars. */
const B = (body: string, flags = "") => new RegExp(`(?:^|[^A-Za-z0-9_-])${body}(?![A-Za-z0-9_-])`, flags);

const GIT_COMMIT = /(?:^|[^A-Za-z0-9_-])git\s+(?:-[cC]\s+\S+\s+|--[A-Za-z-]+(?:=\S+)?\s+)*commit\b/;
/**
 * Any real push. `--help` is excluded: it contacts nothing, so it must not consult HEAD.
 * Global options (`-C <path>`, `-c k=v`, `--git-dir=…`) are allowed for explicitly:
 * `git -C <repo> push` is an ordinary push, and the first version of this pattern
 * required `push` immediately after `git`, so the `-C` form sailed past the branch
 * check entirely — an UNDER-block, measured 2026-09-17. `-C <path>` here is also
 * what commandCwd() reads to decide which repo's HEAD to consult.
 */
const GIT_PUSH =
	/(?:^|[^A-Za-z0-9_-])git\s+(?:-[cC]\s+\S+\s+|--[A-Za-z-]+(?:=\S+)?\s+)*push\b(?!.*--help)/;
const POWERSHELL = B("(?:powershell|pwsh)(?:\\.exe)?", "i");
const PUSH_MAIN =
	/(?:^|[^A-Za-z0-9_-])git\s+(?:-[cC]\s+\S+\s+|--[A-Za-z-]+(?:=\S+)?\s+)*push\b[^\n;|&]*\b(?:main|master)\b/;

/**
 * A bare merge — `git merge`, `gh pr merge` or `gh stack merge` — unsquashed.
 *
 * `(?![\w-])` rather than `\b`: a word boundary after `merge` ALSO matches the
 * read-only plumbing that shares the prefix. `git merge-base`, `git merge-tree`,
 * `git merge-file` and `git merge-index` are queries, not merges, and `merge-base`
 * is ordinary in any branch comparison. `\b` sits between `e` and `-`, so all four
 * were refused as bare merges. Measured 2026-09-28: `git merge-tree --write-tree`
 * was blocked mid-investigation. Every recorded firing before that was a genuine
 * merge, so this was latent rather than a live false positive — but one command
 * away, and `git merge-base` is how you check whether two branches have diverged.
 */
const MERGE_UNSQUASHED =
	/(?:^|[^A-Za-z0-9_-])(?:git\s+merge|gh\s+pr\s+merge|gh\s+stack\s+merge)(?![\w-])(?!.*(?:--squash|--rebase|--merge-method[=\s]+(?:squash|rebase)))/;
/**
 * Branch creation, with the global options allowed explicitly — the same clause
 * GIT_PUSH carries, and for the same reason.
 *
 * Measured 2026-10-11, while probing the new prefix set: `git -C <repo> checkout
 * -b release/v9.9.9-probe` is an ordinary branch creation that sailed past the
 * branch-naming check, because this pattern required `checkout -b` immediately
 * after `git`. No name was extracted, so BRANCH_OK never ran and the retired
 * `release/` prefix was created in a live repo. Same under-block class as the
 * `git -C <repo> push` gap fixed on 2026-09-17: a matcher that only reads the
 * bare form reports a pass for every variant it cannot see.
 */
const BRANCH_CREATE =
	/(?:^|[^A-Za-z0-9_-])git\s+(?:-[cC]\s+\S+\s+|--[A-Za-z-]+(?:=\S+)?\s+)*(?:checkout\s+-b|switch\s+-c)\s+['"]?([^\s'";|&]+)/;
/**
 * The accepted branch prefixes — the one field a branch and its task must agree
 * on.
 *
 * The standard prefix is the Backlog.md task's own `kind` label
 * (`skill://git-conventions` Branching, `skill://backlog-conventions`): a
 * branch, its PR title, the squash commit on `main` and the task then describe
 * the same work, and the kind→commit-type mapping that decides a release's
 * version has one source. The commit-type prefixes stay ACCEPTED because more
 * than 30 other repos document them in their own `AGENTS.md`/`CONTRIBUTING.md`,
 * and a repo's convention outranks this skill. `release/` is RETIRED: a release
 * is a tag release-please makes on `main`, so a release branch has nothing left
 * to be, and a hotfix goes forward on a `bugfix/` branch.
 *
 * CASE-SENSITIVE, as it always was: `Feature/x` is refused, and so is any name
 * whose first segment is not a kind — a tracker-generated `owner/…` form carries
 * none — so agents name branches themselves.
 */
const BRANCH_OK =
	/^(?:bugfix|feature|refactor|spec|design|investigation|migration|chore|docs|continuous-improvement|content|feat|fix|perf|test|ci|build)\//;
/**
 * Issues live in Backlog.md (skill://backlog-conventions), not GitHub. Agents
 * had filed ~120 open GitHub issues across 13 repos by 2026-10-11, and only some
 * of them carried into the tracker afterwards, so the backlog was split.
 *
 * Two creation routes: `gh issue create`, and `gh api` POSTing to a repo's
 * `/issues` collection. The api form counts as a POST when it says so
 * (`-X POST` / `--method POST`) or sends fields (`-f`/`-F`/`--field`/
 * `--raw-field`/`--input`, which make gh default to POST). Reading, commenting
 * on and closing existing GitHub issues stays allowed: `/issues/<n>/comments`
 * is not the collection, and `gh issue close|comment|view|list` are not create.
 */
const GH_ISSUE_CREATE = /(?:^|[^A-Za-z0-9_-])gh\s+issue\s+create(?![\w-])/;
const GH_API_ISSUES = /(?:^|[^A-Za-z0-9_-])gh\s+api\b[^\n;|&]*?\/?repos\/[^/\s'"]+\/[^/\s'"]+\/issues(?=['"\s]|$)[^\n;|&]*/;
const API_WRITES = /(?:^|\s)(?:-X\s*POST|--method[=\s]+POST|-f|-F|--field|--raw-field|--input)(?=[\s=]|$)/i;
/**
 * The accepted commit types.
 *
 * `style` is here because the Conventional Commits spec names it in the
 * canonical set (§4, fetched 2026-09-28) alongside build, chore, ci, docs,
 * refactor, perf and test. It was the ONLY member of that set missing, and the
 * omission was invisible until the firings were counted: 5 of the 55 recorded
 * `conventional-commits` firings were valid `style(…)` commits, every one a
 * correct message refused. A hand-copied list drifts by exactly one element.
 */
const CONVENTIONAL = /^(?:feat|fix|docs|refactor|perf|test|build|ci|chore|revert|style)(?:\([^)]+\))?!?:\s/;

/**
 * The commit-message flag, as a STANDALONE token.
 *
 * The `(?:^|\s)` before the dash is load-bearing. Without it the pattern matches
 * a `-m` that is merely *inside* a hyphenated word, and the `\s*` after it allows
 * zero characters — so any word shaped `…-m…` yields a bogus message. Measured
 * 2026-09-28, three legitimate commits refused in a row, each for a word in its
 * own argument list:
 *
 *   joint-most-fired      read as the flag plus "ost-fired"
 *   plan-msg.txt          read as the flag plus "sg.txt"          (x2)
 *
 * `--message` is matched deliberately rather than by accident: the old bare `-m`
 * happened to find the `-m` inside `--message` and captured "essage" as the
 * message, so it refused non-conventional text while never reading the real one.
 */
const MSG_FLAG = /(?:^|\s)(?:-m|--message)\s*(?:'([^']*)'|"([^"]*)"|(\S+))/;

/**
 * A branch-creating segment, for the chain scanner below. Distinct from
 * BRANCH_CREATE, which is a bare `exec` over the whole string and therefore
 * matches inside quoted spans; the scanner needs a segment-anchored test.
 */
const SEG_SWITCH_NEW = /(?:^|[^A-Za-z0-9_-])git\s+(?:checkout\s+-b|switch\s+-c)\b/;
/** Any git invocation in a segment, for the inverted-polarity test. */
const SEG_ANY_GIT = /(?:^|[^A-Za-z0-9_-])git\s/;
/** `git -C <path>`: targets another repo, so per-segment reasoning is unsound. */
const SEG_DASH_C = /(?:^|[^A-Za-z0-9_-])git\s+-C\s/;
/**
 * The ONLY git subcommands that cannot move HEAD. Everything else is rejected,
 * which is the point: an allowlist (rather than a require-benign-match list)
 * does not re-block on a legitimate step nobody enumerated — `cd src`,
 * `mkdir -p`, a subshell — while still refusing an unknown one.
 *
 * `push` is here because it cannot move HEAD; it is guarded separately by the
 * standing-on-main branch check and the explicit-ref PUSH_MAIN check.
 */
const SEG_HEAD_NEUTRAL_GIT = /(?:^|[^A-Za-z0-9_-])git\s+(?:add|status|diff|rm|mv|push)\b/;

/**
 * True when the chain CREATES a branch before committing and provably stays on it.
 *
 * WHY THIS EXISTS. Measured 2026-09-19: a compound chain that creates its own
 * branch was refused —
 *
 *     git checkout -b docs/x && git add f && git commit -m "docs: ..."
 *     Blocked (no-commit-on-main): HEAD is 'main'.
 *
 * The guard reads HEAD ONCE, before execution, so it sees `main` and cannot know
 * the checkout in the same chain would have moved it. The corrected workflow the
 * guard exists to encourage was itself blocked, and re-blocked after every
 * correction. This resolves the chain WITHOUT a shell, from the command text.
 *
 * NOT A WAIVER. The allowance is a property of the COMMAND (a valid branch
 * creation precedes the commit and nothing after it can move HEAD), not a marker
 * the checked agent writes — the same reasoning that legitimises the
 * `repoIsEmpty` bootstrap case. A waiver the agent can write constrains nothing.
 *
 * Four rules, each closing a bypass found by testing this against itself:
 *  1. `-C` ANYWHERE in the chain is rejected outright. The checkout and the
 *     commit could target different repos, so segment reasoning says nothing
 *     about where the commit lands.
 *  2. Scan BACK from the commit for a valid branch creation. Any segment crossed
 *     containing a non-HEAD-neutral git rejects the chain.
 *  3. DO NOT STOP AT THE ANCHOR. A first version returned here, and allowed
 *     `checkout -b feat/x && commit && checkout main && commit` — the second
 *     commit lands on main. Segments AFTER the anchor are scanned for HEAD moves.
 *  4. Order matters: a commit before the checkout is never allowed.
 */
function chainCreatesBranch(command: string): boolean {
	const segments = command
		.split(/&&|;|\|\|/)
		.map((s) => s.trim())
		.filter(Boolean);

	// (1) A -C anywhere: cannot reason about which repo the commit lands in.
	if (segments.some((s) => SEG_DASH_C.test(s))) return false;

	for (let i = 0; i < segments.length; i++) {
		if (!GIT_COMMIT.test(segments[i])) continue;
		// (4) The commit must not be the first thing in the chain.
		if (i === 0) return false;

		// (2) Scan back for the branch creation, rejecting anything ambiguous.
		let anchor = -1;
		for (let j = i - 1; j >= 0 && anchor < 0; j--) {
			const s = segments[j];
			if (SEG_SWITCH_NEW.test(s)) {
				const name = /(?:checkout\s+-b|switch\s+-c)\s+['"]?([^\s'";|&]+)/.exec(s)?.[1];
				if (!name || !BRANCH_OK.test(name)) return false;
				anchor = j;
				break;
			}
			if (SEG_ANY_GIT.test(s) && !SEG_HEAD_NEUTRAL_GIT.test(s)) return false;
		}
		if (anchor < 0) return false;

		// (3) Anything AFTER the anchor that can move HEAD invalidates it.
		for (let j = anchor + 1; j < segments.length; j++) {
			if (j === i || GIT_COMMIT.test(segments[j])) continue;
			const s = segments[j];
			if (SEG_ANY_GIT.test(s) && !SEG_HEAD_NEUTRAL_GIT.test(s)) return false;
		}
		return true;
	}
	return false;
}

/**
 * Sanctioned forms are removed before testing, so `uv pip install` cannot be
 * mistaken for the forbidden `pip install` it contains.
 */
function stripSanctioned(command: string): string {
	return command
		.replace(/\buv\s+pip\s+install\b/g, " ")
		.replace(/\buv\s+tool\s+install\b/g, " ")
		.replace(/\buv\s+add\b/g, " ")
		.replace(/\buv\s+sync\b/g, " ")
		.replace(/\buv\s+run\b/g, " ");
}

const CHECKS: Check[] = [
	{
		id: "uv-not-pip",
		match: (c) => B("(?:python[0-9.]*\\s+-m\\s+)?pip[0-9]?\\s+install").exec(stripSanctioned(c))?.[0] ?? null,
		reason:
			"pip is banned in favour of uv. Use `uv add <pkg>` for a project dependency, " +
			"`uv run <cmd>` to execute in the project env, or `uv tool install <pkg>` for a CLI tool. `uv pip install` is also sanctioned.",
	},
	{
		id: "no-powershell",
		match: (c) => POWERSHELL.exec(c)?.[0] ?? null,
		reason:
			"PowerShell is banned on this machine. Use Git Bash / POSIX shell commands, or the dedicated file tools.",
	},
	{
		id: "no-push-to-main",
		// The explicit-ref form (`git push origin main`), which reaches here from any
		// branch that is not main — the branch block above only covers standing ON main.
		match: (c) => PUSH_MAIN.exec(c)?.[0] ?? null,
		reason:
			"Never push directly to main/master. Push your own branch — prefixed with the task's `kind` label (`bugfix/*`, `feature/*`, `docs/*`, …) — and squash-merge it via PR.",
	},
	{
		id: "conventional-commits",
		match: (c) => {
			const at = c.search(GIT_COMMIT);
			if (at === -1) return null;
			// `-m` is searched for ONLY on the line that carries the commit invocation.
			// A heredoc body is stdin data, not command text, and prose in it can contain
			// "-m" by accident: measured 2026-09-28, a body line reading
			// "no-commit-on-main" was parsed as `-m ain`, and a legitimate commit was
			// refused for a non-conventional message it never had. Lines are bounded by
			// newline rather than by the whole command. joinContinuations() has already
			// joined backslash-continued lines, so a genuine `git commit \` + `-m "…"`
			// still lands on one line. Offsets come from GIT_COMMIT's own match, so this
			// cannot drift from the token test above.
			const start = c.lastIndexOf("\n", at) + 1;
			const nl = c.indexOf("\n", at);
			const line = c.slice(start, nl === -1 ? c.length : nl);
			const msg = MSG_FLAG.exec(line);
			if (!msg) return null; // no -m: an editor opens, message unknown, allow
			const text = (msg[1] ?? msg[2] ?? msg[3] ?? "").trim();
			return text && !CONVENTIONAL.test(text) ? text : null;
		},
		reason:
			"Commit messages must be conventional: `type(scope): summary`, where type is one of " +
			"feat, fix, docs, refactor, perf, test, build, ci, chore, revert, style. Example: `fix(auth): handle null token`.",
	},
	{
		id: "no-bare-merge",
		match: (c) => MERGE_UNSQUASHED.exec(c)?.[0] ?? null,
		reason:
			"Merge commits are not used here — PRs squash-merge. To absorb upstream changes, " +
			"`git rebase main` while on your branch. If you truly need one, `git merge --squash`, " +
			"`gh pr merge --squash` or `gh stack merge --squash` is allowed.",
	},
	{
		id: "branch-naming",
		match: (c) => {
			const m = BRANCH_CREATE.exec(c);
			if (m && !BRANCH_OK.test(m[1])) return m[1];
			// `gh stack init|add` names branches without `git checkout -b`: see the end of this file.
			return stackBranchProblem(c);
		},
		reason:
			"Branch names start with the task's `kind` label: `bugfix/`, `feature/`, `refactor/`, `spec/`, `design/`, `investigation/`, " +
			"`migration/`, `chore/`, `docs/`, `continuous-improvement/` or `content/`, then the task's id and a slug " +
			"(`skill://git-conventions` Branching, `skill://backlog-conventions`). " +
			"The conventional-commit types `feat/`, `fix/`, `perf/`, `test/`, `ci/` and `build/` are also accepted. " +
			"`release/` is retired — a release is a tag on `main`. " +
			"Example: `git checkout -b bugfix/omp-12-null-cursor`, or `gh stack add feature/omp-12-layer-two` — a stack command must name its branches.",
	},
	{
		id: "issues-in-backlog",
		match: (c) => {
			const create = GH_ISSUE_CREATE.exec(c);
			if (create) return create[0].trim();
			const api = GH_API_ISSUES.exec(c);
			return api && API_WRITES.test(api[0]) ? api[0].trim() : null;
		},
		reason:
			"Issues are tracked in Backlog.md, not GitHub (skill://backlog-conventions). Create the task with `backlog task create` " +
			"or the `task_create` MCP tool — one `kind` and one `domain` label — then reference it as `<PREFIX>-<n>` in the branch, " +
			"PR title and `Closes <PREFIX>-<n>` in the PR body. Reading, commenting on or closing existing GitHub issues is still allowed.",
	},
];

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
	exec(
		command: string,
		args: string[],
		opts?: { cwd?: string; timeout?: number },
	): Promise<{ stdout?: string; stderr?: string; code?: number }>;
}

/** Command surfaces. `eval` matters: it can reach a shell via subprocess. */
const COMMAND_TOOLS = new Set(["bash", "eval"]);

function commandOf(toolName: string, input: Record<string, unknown>): string {
	const key = toolName === "bash" ? "command" : "code";
	const value = input[key] ?? input.command ?? input.code ?? "";
	return typeof value === "string" ? value : "";
}

/**
 * Join shell line continuations before any check sees the command.
 *
 * A backslash-newline is a line JOIN, not a separator: `pip \` + newline +
 * `install` is `pip install` to the shell. Measured, not reasoned — that exact
 * form ran straight through this guard and installed a package, because the
 * matcher wanted whitespace after `pip` and found a backslash. Every check
 * reads the normalised command, so the join happens once, here.
 */
function joinContinuations(command: string): string {
	return command.replace(/\\\r?\n/g, " ");
}

/**
 * Make a path from a command string usable as a spawn `cwd`.
 *
 * Two normalizations, both MEASURED 2026-09-17 by spawning real git with the
 * candidate as `cwd`, no shell in the path:
 *
 *  - `~` (and `$HOME`) is NOT expanded by a non-shell spawn. `~/repos/x` throws
 *    ENOENT at spawn, git never runs, `currentBranch` gets null, and the branch
 *    check FAILS OPEN — so `cd ~/repos/<repo-on-main> && git commit` would have
 *    written to main while leaving no block and no record. That is the ordinary
 *    form of the command, and it is why this is a fix rather than a note.
 *  - The MSYS `/c/Users/...` form throws ENOENT too, while `C:/Users/...`
 *    succeeds for the same directory. Convert the drive prefix.
 */
function expandHome(path: string): string {
	const home = process.env.HOME || process.env.USERPROFILE || "";
	const expanded =
		path === "~" ? home : path.startsWith("~/") || path.startsWith("~\\") ? home + path.slice(1) : path;

	// MSYS /c/foo -> C:/foo. Only for a single-letter drive, and only at the start.
	const msys = /^\/([A-Za-z])\//.exec(expanded);
	return msys ? `${msys[1].toUpperCase()}:/${expanded.slice(3)}` : expanded;
}

/**
 * The directory a git command actually runs in, which is NOT always `ctx.cwd`.
 *
 * Measured failure, 2026-09-17: with the harness cwd on a repo sitting on `main`,
 * every `cd ~/repos/other && git commit` was blocked — the guard read the
 * harness's HEAD (main) and never saw the leading `cd`, even after the target
 * repo had correctly been given a branch. That is a false block, and worse, it
 * blocks the corrected form of the exact workflow the guard exists to encourage
 * (branch in the target repo, then commit), so the agent's next move after being
 * corrected is blocked again.
 *
 * Two forms are honoured, both unambiguous and both resolved WITHOUT a shell:
 * a leading `cd <path> &&` (or `;`) prefix, and `git -C <path>`. Both are passed
 * through `expandHome` first, because a non-shell spawn does NOT expand `~` and
 * does not accept the MSYS `/c/...` drive form: either one throws ENOENT, git
 * never runs, and the branch check FAILS OPEN. That is the dangerous direction,
 * so it is normalized rather than documented.
 *
 * Anything else — a `cd` after a `;`, a subshell, a variable, a chained second
 * `cd` — is left to `ctx.cwd`. Note this fallback is NOT automatically safe: an
 * unrecognised form whose HEAD cannot be read returns null from `currentBranch`
 * and the check does not fire. The rule holds only because every path that
 * reaches git goes through the same normalization.
 */
function commandCwd(command: string, fallback?: string): string | undefined {
	const dashC = /(?:^|[^A-Za-z0-9_-])git\s+-C\s+(?:'([^']*)'|"([^"]*)"|(\S+))/.exec(command);
	const dcPath = dashC?.[1] ?? dashC?.[2] ?? dashC?.[3];
	if (dcPath) return expandHome(dcPath);

	// A leading `cd <path> &&` prefix, which is how these commands are written in
	// practice. Anchored at the start: a later `cd` is a different directory and
	// guessing which one the git command runs in is not safe.
	const cd = /^\s*cd\s+(?:'([^']*)'|"([^"]*)"|([^&;|]+?))\s*(?:&&|;)/.exec(command);
	const cdPath = cd?.[1] ?? cd?.[2] ?? cd?.[3];
	return cdPath ? expandHome(cdPath.trim()) : fallback;
}

/**
 * Current branch, or null if not a repo / undeterminable.
 *
 * `exec` takes an ARGS ARRAY, not a single command string: passing an options
 * object where the array belongs spreads a non-iterable and throws. That is not
 * hypothetical — the first version of this did exactly that, the catch below
 * swallowed it, and commit-on-main failed open. Unverifiable HEAD means "do not
 * block", which is the right call for branch detection, but a silent catch is
 * how a guard becomes inert without anyone noticing.
 */
async function currentBranch(pi: HookApi, cwd?: string): Promise<string | null> {
	try {
		const out = await pi.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, timeout: 5000 });
		if ((out?.code ?? 0) !== 0) return null;
		const name = (out?.stdout ?? "").trim();
		return name && name !== "HEAD" ? name : null;
	} catch {
		return null;
	}
}

/**
 * True when the repo has no commits at all.
 *
 * This is the ONE case where committing on main is allowed, and it is a FACT
 * ABOUT THE REF rather than a claim by the agent — nothing in the command can
 * assert it, so it is not self-authorization and cannot be used to lift a block
 * on a repo that is already alive. Without it, a scaffolded repo is permanently
 * un-committable: `git checkout -b feat/x` needs a commit to branch from, and no
 * PR is possible against a ref with no commits.
 *
 * `git rev-list --count HEAD` fails (non-zero) on an unborn HEAD, which is
 * exactly the bootstrap case; an unknown answer returns false, keeping the block.
 */
async function repoIsEmpty(pi: HookApi, cwd?: string): Promise<boolean> {
	try {
		const out = await pi.exec("git", ["rev-list", "--count", "HEAD"], { cwd, timeout: 5000 });
		if ((out?.code ?? 1) !== 0) return true;
		return Number.parseInt((out?.stdout ?? "").trim(), 10) === 0;
	} catch {
		return false;
	}
}

/** The push half of GIT_PUSH with the rest of its segment captured, to read the remote. */
const PUSH_ARGS = /(?:^|[^A-Za-z0-9_-])git\s+(?:-[cC]\s+\S+\s+|--[A-Za-z-]+(?:=\S+)?\s+)*push\b([^\n;|&]*)/;

/**
 * Whether this push CREATES the protected branch on its remote: the command
 * holds exactly one `git push`, and `git ls-remote --heads <remote> main master`
 * succeeds and lists neither. That is the bootstrap case for push, the twin of
 * `repoIsEmpty`: a fresh GitHub repo has no `main`, so no PR can target it, and
 * without this every new repo needs a human to create `main` by hand (measured
 * 2026-10-10, on an example repo and on each new repo before it). Feature branches
 * already on the remote do not count: the ordinary order is to push the branch
 * first and only then discover there is no base for its PR, and the first cut
 * of this check, "remote has no branches at all", refused exactly that case.
 *
 * Like `repoIsEmpty` it is a FACT read from the remote, not a claim in the
 * command, so the checked agent cannot assert it; once `main` or `master` exists
 * on the remote, every later push to either is refused again. It fails closed: a
 * remote that cannot be read, a misparsed remote word, or a second push in the
 * same chain (which would land after the first had created the branch) all keep
 * the block.
 *
 * The remote is the first non-flag word after `push`, else `origin` — git's own
 * default when the branch has no upstream, which a first push never has.
 */
async function pushCreatesProtectedBranch(pi: HookApi, command: string, cwd?: string): Promise<boolean> {
	if ((command.match(new RegExp(GIT_PUSH.source, "g")) ?? []).length !== 1) return false;
	const words = (PUSH_ARGS.exec(command)?.[1] ?? "").trim().split(/\s+/);
	const remote = words.find((w) => w && !w.startsWith("-")) ?? "origin";
	try {
		const out = await pi.exec("git", ["ls-remote", "--heads", remote, "refs/heads/main", "refs/heads/master"], {
			cwd,
			timeout: 15000,
		});
		return (out?.code ?? 1) === 0 && (out?.stdout ?? "").trim() === "";
	} catch {
		return false;
	}
}

export default function (pi: HookApi): void {
	pi.on("tool_call", async (event, ctx) => {
		if (!event.toolName || !COMMAND_TOOLS.has(event.toolName)) return;

		const input = event.input ?? {};
		const raw = commandOf(event.toolName, input);
		if (!raw || raw.length > 20_000) return;
		const command = joinContinuations(raw);
		// Read lazily and at most once: only a push that would otherwise be blocked
		// pays for the ls-remote network call.
		let firstPush: Promise<boolean> | undefined;
		const createsProtected = () =>
			(firstPush ??= pushCreatesProtectedBranch(pi, command, commandCwd(command, ctx.cwd)));

		// Branch discipline, before the message checks: committing on main is what
		// makes a direct push possible, so it is stopped at the earlier step. A push
		// while standing on main gets the same treatment, because `git push` carries
		// no `main` token for argument matching to find — that hole made the
		// no-push-to-main rule false in its most ordinary case. Detecting HEAD costs
		// a git call, so a cheap string test gates it.
		if (GIT_COMMIT.test(command) || GIT_PUSH.test(command)) {
			// HEAD is read from the repo the command actually runs in: `cd`/`-C` in the
			// command wins over the harness cwd, which is often a different repo.
			const cwd = commandCwd(command, ctx.cwd);
			const head = await currentBranch(pi, cwd);
			if (head === "main" || head === "master") {
				const committing = GIT_COMMIT.test(command);
				const id = committing ? "no-commit-on-main" : "no-push-to-main";

				// FIRST ALLOWANCE, and it is bootstrap. A repo with no commits
				// cannot take a branch (`git checkout -b` needs something to branch
				// from) and no PR is possible against an unborn ref, so without this
				// a scaffolded repo is permanently un-committable. The condition is a
				// FACT read from git — zero commits — not a marker in the command, so
				// the agent cannot assert it. Only the first commit; the second commit
				// on main re-enters this block and is refused. The push twin is
				// `pushCreatesProtectedBranch`, below.
				if (committing && (await repoIsEmpty(pi, cwd))) {
					pi.appendEntry(RECORD_TYPE, {
						guard: "bootstrap-first-commit",
						branch: head,
						cwd,
						at: new Date().toISOString(),
					});
					return;
				}

				// NO ESCAPE HATCH beyond bootstrap, deliberately. On 2026-09-16
				// `guard-ok: bootstrap` was appended twice on this exact path, with a
				// reason that is a true statement about the ref ("no PR is possible
				// against a ref with no commits") and therefore always available — it
				// was used on repos that already had commits. A marker the checked
				// agent writes is authorized by that agent, so it constrains nothing.
				// The way out is the ordinary one: branch, push the branch, PR.
				//
				// SECOND ALLOWANCE, and also a fact about the COMMAND: a chain that
				// creates a valid branch before committing and provably stays on it.
				// HEAD is read once, before execution, so `git checkout -b docs/x &&
				// ... && git commit` looks like a commit on main even though the
				// checkout in the same chain moves it. This is not a waiver — the
				// agent cannot assert it, only write the command that makes it true —
				// and it does NOT relax the rule: the chain must still leave HEAD off
				// main, which is what `chainCreatesBranch` proves. Measured false
				// block, 2026-09-19; the corrected workflow was refused and re-refused.
				//
				// STRUCTURE MATTERS HERE. This must NOT `return` — a bare return exits
				// the handler before `CHECKS`, so an allowed chain would skip
				// conventional-commits, no-bare-merge and branch-naming. That was a
				// real bypass in the first cut of this fix: a chain that creates a
				// branch could carry a non-conventional message AND an unsquashed
				// merge. The allowance therefore guards the BLOCK, and control falls
				// through to the other checks either way.
				// THIRD ALLOWANCE: the push that creates main/master on a remote that
				// has neither (see `pushCreatesProtectedBranch`). Also falls through to CHECKS.
				const bootstrapPush = !committing && (await createsProtected());
				if (!bootstrapPush && !(committing && chainCreatesBranch(command))) {
					pi.appendEntry(RECORD_TYPE, {
						guard: id,
						branch: head,
						cwd: ctx.cwd,
						at: new Date().toISOString(),
					});
					return {
						block: true,
						reason:
							`Blocked (${id}): HEAD is '${head}'.\n` +
							(committing
								? `Work happens on a branch. Create one first — as its OWN command ` +
									`(git checkout -b feature/<name>), then commit in the next call. ` +
									`A chain that branches and commits in ONE call is refused unless the ` +
									`branch creation is a valid prefix and nothing in the chain returns to ${head}. `
								: `Never push while standing on ${head}. Switch to your branch and push that. ` +
									`(Creating main/master on a remote that has neither yet is allowed.) `) +
							`PRs squash-merge into ${head}.\n` +
							`This one has no override: ` +
							(committing
								? `a commit is the permanent record and lands on ${head} directly.`
								: `writing to ${head} is the act this guard exists to stop; the agent being checked cannot authorize it.`),
					};
				}
				pi.appendEntry(RECORD_TYPE, {
					guard: bootstrapPush ? "bootstrap-first-push" : "chain-creates-branch",
					branch: head,
					cwd,
					at: new Date().toISOString(),
				});
			}
		}

		// ── THE FAIL-CLOSED VERDICT (OMP-13) ──
		// Each check is judged by two views of the same rule: the text matcher (what
		// `origin/main` blocks — the floor) and the structural matcher (the program
		// that will actually run, with quoted words as data). The structural view may
		// ALLOW what the text view blocks only when the whole command is understood;
		// anything unmodelled keeps the text verdict, so an under-block against main
		// is impossible by construction.
		const analysis = analyse(command);
		for (const check of ALL_CHECKS) {
			const textHit = check.match(command);
			const structHit = STRUCTURAL[check.id]?.(analysis) ?? null;
			if (!textHit && !structHit) continue;
			if (textHit && !structHit && analysis.understood) continue;
			const hit = structHit ?? textHit ?? check.id;
			if (check.id === "no-push-to-main" && (await createsProtected())) {
				pi.appendEntry(RECORD_TYPE, { guard: "bootstrap-first-push", cwd: ctx.cwd, at: new Date().toISOString() });
				continue;
			}

			pi.appendEntry(RECORD_TYPE, {
				guard: check.id,
				matched: hit.slice(0, 200),
				understood: analysis.understood,
				cwd: ctx.cwd,
				at: new Date().toISOString(),
			});

			return {
				block: true,
				reason:
					`Blocked (${check.id}): ${hit.slice(0, 160)}\n` +
					`${check.reason}\n` +
					`This has no override: a marker the agent being checked can write is authorized by ` +
					`that agent, so it constrains nothing. If this is a false positive, the matcher is what gets fixed.`,
			};
		}

		// ── MERGE GATE (OMP-9 AC3) ──
		// Runs LAST, after every text check: a merge another check already refuses
		// (an unsquashed one is `no-bare-merge`) pays for no network call at all.
		const mergeProblem = await mergeGateProblem(pi, command, commandCwd(command, ctx.cwd));
		if (mergeProblem) {
			pi.appendEntry(RECORD_TYPE, {
				guard: mergeProblem.id,
				detail: mergeProblem.detail,
				cwd: ctx.cwd,
				at: new Date().toISOString(),
			});
			return {
				block: true,
				reason:
					`Blocked (${mergeProblem.id}): ${mergeProblem.detail}\n` +
					(mergeProblem.id === "checks-not-green" ? MERGE_NOT_GREEN_REASON : MERGE_UNVERIFIED_REASON) +
					`\nThis has no override: a marker the agent being checked can write is authorized by ` +
					`that agent, so it constrains nothing. Wait for the checks to conclude, then merge.`,
			};
		}
	});
}

/**
 * Branch creation through GitHub native stacks (GA 2026-10-06; `pb-open-pr`,
 * `pb-land`). `gh stack init [branches…]` and `gh stack add [branch]` create or
 * adopt the branches they name, and BRANCH_CREATE never sees them because no
 * `git checkout -b` runs. Worse, `gh stack add -m <msg>` with no name generates
 * one "in date and slug format, such as `03-24-add_login`" (docs.github.com
 * stacked-prs-cli-commands, read 2026-10-18), which no kind prefix can match. So
 * a stack command must name its branches, and each name must pass BRANCH_OK.
 *
 * `gh stack merge` is in MERGE_UNSQUASHED for a related reason: non-interactive,
 * it merges with "the merge method you last used unless you specify one" (same
 * page), so one earlier merge-commit landing would make every later bare
 * `gh stack merge` land merge commits too.
 *
 * Declared after the hook (and below every line `docs/guards.md` cites by
 * number); the CHECKS closures call it at run time, after module evaluation.
 */
const GH_STACK_CREATE = /(?:^|[^A-Za-z0-9_-])gh\s+stack\s+(init|add)(?![\w-])([^\n;|&]*)/g;
/** gh stack init/add flags that consume the next token as their value. */
const GH_STACK_VALUE_FLAGS = new Set(["-b", "--base", "-m", "--message"]);
/**
 * The first branch-naming problem in any `gh stack init|add` of the command, or
 * null when there is none. Quoted strings are removed from the whole command
 * first: inside a stack command they are `-m` messages, and anywhere else they
 * are text — `grep "gh stack add x" docs.md` names no branch. Then, per stack
 * command, flags and the values of value-taking flags go; combined short flags
 * ending in `m` (`-Am`, `-um`) take a value too. What remains is branch names.
 * Every stack command in a chain is checked, not only the first.
 * @returns null when allowed; otherwise the offending name or a description of the missing name.
 */
function stackBranchProblem(command: string): string | null {
	const unquoted = command.replace(/'[^']*'|"[^"]*"/g, " \u0000 ");
	for (const m of unquoted.matchAll(GH_STACK_CREATE)) {
		const tokens = m[2].trim().split(/\s+/).filter(Boolean);
		const names: string[] = [];
		for (let i = 0; i < tokens.length; i++) {
			const t = tokens[i];
			if (t === "\u0000") continue;
			if (t.startsWith("-")) {
				const takesValue = !t.includes("=") && (GH_STACK_VALUE_FLAGS.has(t) || /^-[A-Za-z]*m$/.test(t));
				if (takesValue) i++;
				continue;
			}
			names.push(t);
		}
		if (names.length === 0) return `gh stack ${m[1]} with no branch name (it would prompt, or generate a date-slug name)`;
		const bad = names.find((name) => !BRANCH_OK.test(name));
		if (bad) return bad;
	}
	return null;
}

/**
 * ── MERGE GATE (OMP-9 AC3) ─────────────────────────────────────────────────
 *
 * `gh pr merge` and `gh stack merge` are refused while any check on the pull
 * request — or, for a stack, on any PR the merge would land — is failing or
 * pending. GitHub's own protection cannot carry this rule here: on a private
 * repo on the Free plan, rulesets and branch protection return 403 (OMP-9), so
 * nothing else refuses a red merge.
 *
 * The merge is found by TEXT, like every other check in this file.
 * `no-bare-merge` (MERGE_UNSQUASHED) already refuses the unsquashed forms, so a
 * command that reaches this gate carries `--squash`, `--rebase` or
 * `--merge-method squash|rebase`. Quoted spans are removed before looking, so
 * `echo 'gh pr merge 2 --squash'` names no merge; in the other direction, a
 * merge written inside quotes (`eval 'gh pr merge 2 --squash'`) is not seen
 * here. Both directions are stated in `docs/guards.md` with the rest of this
 * guard's limits — closing the second needs the structural matcher, which is a
 * separate change.
 *
 * The state comes from the API the CLI itself reads, in ONE call:
 * `gh api graphql` asking for `pullRequest(number:) { statusCheckRollup { state } }`,
 * plus `stack { entries { nodes { pullRequest { … } } } }` for a stack merge.
 * Measured 2026-10-19 against gh 2.81.0 and a live four-PR stack: the rollup is
 * null when the PR has no checks, and its state is one of SUCCESS, PENDING,
 * EXPECTED, FAILURE, ERROR (the StatusState enum).
 *
 * TWO DECISIONS, both deliberate:
 *
 *  - NO CHECKS AT ALL (`statusCheckRollup` null) is ALLOWED. A repo with no CI
 *    must stay mergeable — this guard is global, and most repos it watches have
 *    no workflow — and the rule is about checks that exist. `EXPECTED` is NOT
 *    that case: it means checks are expected and have not reported, so it blocks
 *    with the pending ones.
 *  - ANYTHING UNVERIFIABLE BLOCKS. An unreachable gh, a non-zero exit, an
 *    unparseable answer, an unknown rollup state, a PR that will not resolve, or
 *    a stack that will not enumerate all refuse the merge: the checked agent
 *    controls the environment this hook is handed, and "I could not see the
 *    checks" is not evidence that they are green.
 *
 * `--auto` does NOT lift the gate: auto-merge waits only for REQUIRED checks,
 * and a repo that cannot set required checks would land a pending PR at once.
 *
 * The repository is read from the command, never assumed: `-R other/repo` and
 * `--repo=other/repo` (on either side of the verb) and a PR URL each name one,
 * and the checks are read from THAT repository — a same-numbered PR in the
 * session's repo is a different PR. With nothing named, gh's own
 * `{owner}`/`{repo}` placeholders resolve it.
 *
 * Declared after the hook, like `stackBranchProblem`, so no line
 * `docs/guards.md` cites by number moves; the handler calls these at run time.
 */
const GH_MERGE =
	/(?:^|[^A-Za-z0-9_-])gh\s+((?:-R\s+\S+\s+|--repo(?:=\S+|\s+\S+)\s+)?)(pr|stack)\s+merge(?![\w-])([^\n;|&]*)/g;
/** `gh pr merge` flags that consume the next token as their value. */
const PR_MERGE_VALUE_FLAGS = new Set([
	"-b", "--body", "-F", "--body-file", "-t", "--subject", "-A", "--author-email", "--match-head-commit", "-R", "--repo",
]);
/** `gh stack merge` flags that consume the next token as their value. */
const STACK_MERGE_VALUE_FLAGS = new Set(["--merge-method", "-R", "--repo"]);
const GRAPHQL_PR =
	"query($owner:String!,$name:String!,$num:Int!){repository(owner:$owner,name:$name){pullRequest(number:$num){number statusCheckRollup{state}}}}";
const GRAPHQL_STACK =
	"query($owner:String!,$name:String!,$num:Int!){repository(owner:$owner,name:$name){pullRequest(number:$num){number statusCheckRollup{state} stack{entries(first:100){nodes{pullRequest{number statusCheckRollup{state}}}}}}}}}";
const MERGE_NOT_GREEN_REASON =
	"The command guard refuses a merge while any check on the pull request — or, for a stack, on any PR the merge would land — " +
	"is failing or pending (OMP-9). Wait for the checks to conclude (`gh pr checks <n> --watch`), then merge. " +
	"A PR with no checks at all is allowed: this rule is about checks that exist.";
const MERGE_UNVERIFIED_REASON =
	"The command guard refuses a merge it cannot verify: an unreadable check state is not evidence that the checks are green, " +
	"and the environment this hook is handed is the one the checked agent controls. Repair gh (or read the checks by hand), then merge.";

interface MergeProblem {
	id: "checks-not-green" | "checks-unverified";
	detail: string;
}

/** A pull request as the stack query returns it. */
interface GraphqlPullRequest {
	number?: number;
	statusCheckRollup?: { state?: string } | null;
	stack?: { entries?: { nodes?: { pullRequest?: GraphqlPullRequest | null }[] } } | null;
}

/** One PR's rollup state: null when it is green, else the problem and its direction. */
function rollupProblem(pr: GraphqlPullRequest | null | undefined): MergeProblem | null {
	if (!pr || typeof pr.number !== "number") {
		return { id: "checks-unverified", detail: "a pull request in the stack could not be read" };
	}
	const state = pr.statusCheckRollup?.state;
	if (state === undefined || state === null) return null; // no checks reported: allowed
	if (state === "SUCCESS") return null;
	if (state === "PENDING") return { id: "checks-not-green", detail: `#${pr.number} has checks pending` };
	if (state === "EXPECTED") {
		return { id: "checks-not-green", detail: `#${pr.number} has checks expected but not yet reported` };
	}
	if (state === "FAILURE" || state === "ERROR") {
		return { id: "checks-not-green", detail: `#${pr.number} has a failing check` };
	}
	return { id: "checks-unverified", detail: `#${pr.number} has an unknown check state '${state}'` };
}

/** Parse a gh invocation's JSON answer; null when gh failed or answered nothing usable. */
async function ghJson(pi: HookApi, args: string[], cwd?: string): Promise<unknown> {
	try {
		const out = await pi.exec("gh", args, { cwd, timeout: 20000 });
		if ((out?.code ?? 1) !== 0) return null;
		return JSON.parse(out?.stdout ?? "");
	} catch {
		return null;
	}
}

/** `owner/repo` named by `-R`/`--repo` in this text, or null. */
function namedRepoIn(text: string): string | null {
	const m = /(?:^|\s)(?:-R|--repo)(?:=|\s+)(\S+)/.exec(text);
	if (!m) return null;
	const parts = m[1].split("/").filter(Boolean);
	return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : null;
}

/** The first positional argument of a merge invocation: the PR or stack selector. */
function mergeSelector(args: string, valueFlags: Set<string>): string | undefined {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t === "\u0000") continue; // a quoted span: data, never the selector
		if (t.startsWith("-")) {
			if (!t.includes("=") && valueFlags.has(t)) i++;
			continue;
		}
		return t;
	}
	return undefined;
}

/** The PR a merge selector names, with the repository it names when the selector carries one. */
async function resolveSelector(
	pi: HookApi,
	selector: string | undefined,
	repo: string | null,
	cwd?: string,
): Promise<{ num: number; repo: string | null } | null> {
	if (selector) {
		// A PR URL carries its own repository, which is not necessarily this one.
		const url = /^https?:\/\/[^/\s]+\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/.exec(selector);
		if (url) return { num: Number.parseInt(url[3], 10), repo: `${url[1]}/${url[2]}` };
		if (/^\d+$/.test(selector)) return { num: Number.parseInt(selector, 10), repo };
	}
	const args = ["pr", "view", ...(selector ? [selector] : []), ...(repo ? ["-R", repo] : []), "--json", "number", "-q", ".number"];
	const answer = await ghJson(pi, args, cwd);
	return typeof answer === "number" && Number.isFinite(answer) ? { num: answer, repo } : null;
}

/** Whether one merge invocation may proceed, or the problem that refuses it. */
async function mergeProblemFor(
	pi: HookApi,
	kind: "pr" | "stack",
	args: string,
	repo: string | null,
	cwd?: string,
): Promise<MergeProblem | null> {
	const selector = mergeSelector(args, kind === "pr" ? PR_MERGE_VALUE_FLAGS : STACK_MERGE_VALUE_FLAGS);
	const target = await resolveSelector(pi, selector, repo, cwd);
	if (target === null) {
		return {
			id: "checks-unverified",
			detail: `the pull request to merge${selector ? ` ('${selector}')` : " on this branch"} could not be identified, so its checks could not be read`,
		};
	}
	const num = target.num;
	// `{owner}`/`{repo}` resolve from the session's repo; a command that named
	// another one is read from the repo it named.
	const [owner, name] = target.repo ? target.repo.split("/") : ["{owner}", "{repo}"];
	const answer = await ghJson(
		pi,
		[
			"api", "graphql",
			"-f", `query=${kind === "stack" ? GRAPHQL_STACK : GRAPHQL_PR}`,
			"-F", `owner=${owner}`,
			"-F", `name=${name}`,
			"-F", `num=${num}`,
		],
		cwd,
	);
	const pr = (answer as { data?: { repository?: { pullRequest?: GraphqlPullRequest | null } } } | null)?.data?.repository
		?.pullRequest;
	if (!pr) {
		return { id: "checks-unverified", detail: `the check state of PR #${num} could not be read: gh is unreachable, or could not resolve it` };
	}
	const problems: MergeProblem[] = [];
	if (kind === "stack") {
		if (!pr.stack) {
			return {
				id: "checks-unverified",
				detail: `PR #${num} is not part of a stack, so the PRs this merge would land could not be enumerated`,
			};
		}
		for (const node of pr.stack.entries?.nodes ?? []) {
			const problem = rollupProblem(node?.pullRequest);
			if (problem) problems.push(problem);
		}
	}
	const own = rollupProblem(pr);
	if (own) problems.push(own);
	if (!problems.length) return null;
	// An unreadable state is reported as unverified even when a red one sits
	// beside it: the merge is refused either way, and the reason says which kind
	// of refusal it is.
	const unverified = problems.some((p) => p.id === "checks-unverified");
	return {
		id: unverified ? "checks-unverified" : "checks-not-green",
		detail: problems.map((p) => p.detail).join("; "),
	};
}

/**
 * The gate: null when the command holds no merge invocation that must be
 * refused. Every merge in the command is judged, not only the first.
 */
async function mergeGateProblem(pi: HookApi, command: string, cwd?: string): Promise<MergeProblem | null> {
	const unquoted = command.replace(/'[^']*'|"[^"]*"/g, " \u0000 ");
	for (const m of unquoted.matchAll(GH_MERGE)) {
		const kind = m[2] === "stack" ? "stack" : "pr";
		const repo = namedRepoIn(`${m[1]} ${m[3]}`);
		const problem = await mergeProblemFor(pi, kind, m[3], repo, cwd);
		if (problem) return problem;
	}
	return null;
}
interface Word {
	/** The word as the shell would pass it: quotes removed, escapes resolved. */
	text: string;
	/** True when any part of the word was quoted or escaped. A quoted word is DATA, never a command. */
	quoted: boolean;
}
/** One simple command: the words between two shell separators. */
type Segment = Word[];

/** A command handed to another program as code: a shell string, an interpreter payload, or an argument list. */
interface Payload {
	program: string;
	/** The payload as text: what a message quotes, and what the text rules read. */
	text: string;
	/** True when `text` is a SHELL command line, so it is tokenized as a command. */
	shell: boolean;
	/** The command as an argument list, when the executor execs the words directly. */
	words?: Segment;
}

/** What a check sees: the raw text (cwd resolution, messages), its structure, and any payloads. */
const MAX_RECURSION = 3;
const SHELLS: Record<string, true> = { sh: true, bash: true, dash: true, zsh: true, ksh: true, ash: true };
/**
 * Shell keywords that introduce a command list.
 *
 * The tokenizer splits on `;`, `&&`, `|`, `&`, newlines and parens — not on
 * keywords — so `for i in 1; do pip install x; done` arrives as the segment
 * `do pip install x` and, without this, `do` is read as the program. Measured in
 * review of PR #106: every keyword form was allowed where main's text matcher
 * refused it.
 */
const SHELL_KEYWORDS: Record<string, true> = {
	if: true, then: true, elif: true, else: true, fi: true, while: true, until: true, do: true, done: true,
	for: true, in: true, select: true, case: true, esac: true,
	// A group opener is not a program either: `{ bash -c '…'; }`.
	"{": true, "}": true, "(": true, ")": true,
};
/** Wrapper programs that run the command word that follows them. */
const WRAPPERS: Record<string, true> = {
	sudo: true,
	env: true,
	command: true,
	exec: true,
	nohup: true,
	time: true,
	nice: true,
	setsid: true,
	stdbuf: true,
	xargs: true,
	"!": true,
};
/** Wrapper flags that consume the next word as their value. */
const WRAPPER_VALUE_FLAGS: Record<string, Record<string, true>> = {
	sudo: {
		"-u": true, "--user": true, "-g": true, "--group": true, "-p": true, "--prompt": true, "-C": true,
		"--chdir": true, "-h": true, "--host": true, "-r": true, "--role": true, "-t": true, "--type": true,
		"-U": true, "--other-user": true, "-R": true, "--chroot": true,
	},
	env: { "-u": true, "--unset": true, "-C": true, "--chdir": true, "-S": true, "--split-string": true },
	xargs: {
		"-I": true, "-n": true, "-L": true, "-s": true, "-d": true, "-a": true, "-E": true, "-e": true, "-P": true,
		"--replace": true, "--max-args": true, "--max-lines": true, "--max-chars": true, "--delimiter": true,
		"--arg-file": true, "--eof": true, "--max-procs": true,
	},
	nice: { "-n": true, "--adjustment": true },
	stdbuf: { "-i": true, "-o": true, "-e": true, "--input": true, "--output": true, "--error": true },
};
/** `uv run <cmd>`: the command follows uv's own flags. */
const UV_RUN_VALUE_FLAGS: Record<string, true> = {
	"-w": true, "--with": true, "-p": true, "--python": true, "--extra": true, "--index": true, "--index-url": true,
	"--default-index": true, "--directory": true, "--project": true, "--env-file": true, "--constraint": true,
	"-c": true, "--config-file": true, "--cache-dir": true, "--python-platform": true, "--resolution": true,
	"--group": true, "--no-group": true, "--from": true,
};
const NO_FLAGS: Record<string, true> = {};

/** The program name of a word, without its directory and without a `.exe` suffix. */
function baseName(word: string): string {
	const cut = Math.max(word.lastIndexOf("/"), word.lastIndexOf("\\"));
	const last = cut >= 0 ? word.slice(cut + 1) : word;
	return last.toLowerCase().endsWith(".exe") ? last.slice(0, -4) : last;
}

/** Skip flags (and the values of the named ones) from index `i`; returns the next word index. */
function skipFlags(words: Segment, i: number, valueFlags: Record<string, true>): number {
	while (i < words.length) {
		const t = words[i].text;
		if (!words[i].quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) { i++; continue; }
		if (!t.startsWith("-") || t === "-") break;
		if (t === "--") { i++; break; }
		i += !t.includes("=") && valueFlags[t] === true ? 2 : 1;
	}
	return i;
}

/** The index just past a double-quoted span starting at `i`, honouring escapes. */
function skipDoubleQuoted(s: string, i: number): number {
	i++;
	while (i < s.length) {
		if (s[i] === "\\") { i += 2; continue; }
		if (s[i] === '"') return i + 1;
		i++;
	}
	return s.length;
}

/** A double-quoted span's text, with escapes resolved and its substitutions collected. */
function readDoubleQuoted(s: string, i: number): [string, number, string[]] {
	const subs: string[] = [];
	let out = "";
	i++;
	while (i < s.length) {
		const ch = s[i];
		if (ch === "\\") {
			const n = s[i + 1];
			if (n === '"' || n === "\\" || n === "$" || n === "`") { out += n; i += 2; } else { out += ch; i++; }
			continue;
		}
		if (ch === '"') return [out, i + 1, subs];
		if (ch === "`") { const [inner, next] = readBacktick(s, i); subs.push(inner); i = next; continue; }
		if (ch === "$" && s[i + 1] === "(") { const [inner, next] = balanced(s, i + 2, "(", ")"); subs.push(inner); i = next; continue; }
		out += ch;
		i++;
	}
	return [out, s.length, subs];
}

/** A backtick substitution's inner text and the index just past its closing backtick. */
function readBacktick(s: string, i: number): [string, number] {
	const end = s.indexOf("`", i + 1);
	return end === -1 ? [s.slice(i + 1), s.length] : [s.slice(i + 1, end), end + 1];
}

/** A balanced `open…close` span starting just after the opener, honouring nested quotes. */
function balanced(s: string, start: number, open: string, close: string): [string, number] {
	let depth = 0;
	let i = start;
	while (i < s.length) {
		const ch = s[i];
		if (ch === "\\") { i += 2; continue; }
		if (ch === "'") { const end = s.indexOf("'", i + 1); i = end === -1 ? s.length : end + 1; continue; }
		if (ch === '"') { i = skipDoubleQuoted(s, i); continue; }
		if (ch === open) depth++;
		else if (ch === close) {
			if (depth === 0) return [s.slice(start, i), i + 1];
			depth--;
		}
		i++;
	}
	return [s.slice(start), s.length];
}

/**
 * Simple commands whose STDIN is not the terminal: fed by a pipe, or by a stdin
 * redirect (`< file`, `<<<word`). A shell or interpreter reached this way runs
 * text that was never typed into the command line, so `stdinPayload` resolves it
 * from the producer when the producer is statically readable, and the segment is
 * otherwise reported opaque so the text verdict stands (PR #106 round 4, F1).
 */
const PIPE_FED = new WeakSet<Segment>();
const STDIN_FED = new WeakSet<Segment>();

/** Code consumers whose stdin text the guard could not read at all. */
const OPAQUE_STDIN = new WeakSet<Segment>();

/**
 * The literal text a producer writes to stdout, when the guard can read it.
 *
 * `echo`/`printf` write their arguments. A substitution anywhere in the command,
 * a variable in the arguments, or any other program (`cat file`, `curl …`) means
 * the text is NOT statically known, so `null` is returned and the consumer that
 * would run it is reported opaque instead — the fail-closed answer.
 */
function staticText(seg: Segment | undefined, substitutions: string[]): string | null {
	if (!seg || substitutions.length) return null;
	const inv = invocation(seg);
	if (!inv || (inv.program !== "echo" && inv.program !== "printf")) return null;
	if (inv.args.some((w) => w.text.includes("$"))) return null;
	return inv.args.map((w) => w.text).join(" ");
}

/**
 * Split a command into simple commands, one pass, no shell.
 *
 * Heredoc bodies are consumed to their delimiter and dropped (they are stdin,
 * not command text) — unless the program reading the body is a shell, in which
 * case the body IS the command that runs and is tokenized as one, or an
 * interpreter, in which case the body is that interpreter's code and is kept as
 * a payload. `sh -c`/`bash -c` arguments, `eval` arguments and command
 * substitutions are tokenized recursively, and a payload handed to another
 * program (`python -c`, `node -e`, `ssh <host>`, `docker run|exec`, …) is
 * collected for the executor-payload check, which text-matches what it cannot
 * parse.
 */
function tokenize(command: string, depth = 0, payloads: Payload[] = []): Segment[] {
	const segments: Segment[] = [];
	const substitutions: string[] = [];
	const heredocs: { delim: string; strip: boolean }[] = [];
	let words: Segment = [];
	let buf = "";
	let quoted = false;
	let started = false;
	// Which separator fed the simple command being built, and whether a stdin
	// redirect feeds it: a code consumer reached by `|` or `<` runs text the guard
	// must read from somewhere else, or not at all (see `stdinPayload`).
	let pendingPipe = false;
	let pendingStdin = false;

	const endWord = () => {
		if (!started) return;
		// A lone brace is shell grouping, not a word.
		if (buf !== "{" && buf !== "}") words.push({ text: buf, quoted });
		buf = "";
		quoted = false;
		started = false;
	};
	const endSegment = () => {
		endWord();
		if (words.length) {
			if (pendingPipe) PIPE_FED.add(words);
			if (pendingStdin) STDIN_FED.add(words);
			segments.push(words);
		}
		words = [];
		pendingStdin = false;
	};

	let i = 0;
	const s = command;
	while (i < s.length) {
		const ch = s[i];

		if (ch === "\\") {
			if (s[i + 1] === "\n") { i += 2; continue; } // a line join, not a separator
			buf += s[i + 1] ?? "";
			quoted = true;
			started = true;
			i += 2;
			continue;
		}
		if (ch === "'") {
			const end = s.indexOf("'", i + 1);
			buf += s.slice(i + 1, end === -1 ? s.length : end);
			quoted = true;
			started = true;
			i = end === -1 ? s.length : end + 1;
			continue;
		}
		if (ch === '"') {
			const [text, next, subs] = readDoubleQuoted(s, i);
			buf += text;
			substitutions.push(...subs);
			quoted = true;
			started = true;
			i = next;
			continue;
		}
		if (ch === "$" && (s[i + 1] === "'" || s[i + 1] === '"')) {
			// $'…' and $"…": the prefix only changes how escapes inside are read.
			const q = s[i + 1];
			if (q === "'") {
				const end = s.indexOf("'", i + 2);
				buf += s.slice(i + 2, end === -1 ? s.length : end);
				i = end === -1 ? s.length : end + 1;
			} else {
				const [text, next, subs] = readDoubleQuoted(s, i + 1);
				buf += text;
				substitutions.push(...subs);
				i = next;
			}
			quoted = true;
			started = true;
			continue;
		}
		if (ch === "`" || (ch === "$" && s[i + 1] === "(")) {
			const [inner, next] = ch === "`" ? readBacktick(s, i) : balanced(s, i + 2, "(", ")");
			substitutions.push(inner);
			quoted = true;
			started = true;
			i = next;
			continue;
		}
		if (ch === "#" && !started) {
			const nl = s.indexOf("\n", i);
			i = nl === -1 ? s.length : nl;
			continue;
		}
		if (ch === "\n") {
			endSegment();
			pendingPipe = false;
			i++;
			// A heredoc body is stdin DATA — unless the program reading it is a
			// shell, in which case the body IS the command that runs:
			// `sh <<'EOF'` + `pip install x` + `EOF` was allowed by the
			// structural matcher and refused by the text one (PR #106 review).
			// An INTERPRETER reading it is the same shape one step out: the body is
			// its code (`python3 <<'EOF' … os.system('…') … EOF` runs pip), and it
			// cannot be parsed as shell, so it is kept as that interpreter's payload
			// (PR #106 round 4, F1).
			const owner = segments[segments.length - 1];
			const reader = invocation(owner ?? [])?.program;
			const shellReads = isShell(reader);
			const interpreterReads = reader !== undefined && isInterpreter(reader);
			for (const h of heredocs) {
				let body = "";
				while (i <= s.length) {
					const nl = s.indexOf("\n", i);
					const line = nl === -1 ? s.slice(i) : s.slice(i, nl);
					i = nl === -1 ? s.length : nl + 1;
					if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break;
					body += `${line}\n`;
					if (nl === -1) break;
				}
				if (!body.trim()) continue;
				if (shellReads && depth < MAX_RECURSION) segments.push(...tokenize(body, depth + 1, payloads));
				else if (interpreterReads) payloads.push({ program: reader as string, text: body, shell: false });
			}
			heredocs.length = 0;
			continue;
		}
		if (ch === ";" || ch === "&" || ch === "|") {
			endSegment();
			pendingPipe = ch === "|";
			i += s[i + 1] === ch || (ch === "|" && s[i + 1] === "&") ? 2 : 1;
			continue;
		}
		if (ch === "<" || ch === ">") {
			endWord();
			if (ch === "<" && s[i + 1] === "<" && s[i + 2] !== "<") {
				const strip = s[i + 2] === "-";
				let j = i + (strip ? 3 : 2);
				while (s[j] === " " || s[j] === "\t") j++;
				let delim = "";
				if (s[j] === "'" || s[j] === '"') {
					const end = s.indexOf(s[j], j + 1);
					delim = s.slice(j + 1, end === -1 ? s.length : end);
					j = end === -1 ? s.length : end + 1;
				} else {
					delim = /^[^\s;|&<>]+/.exec(s.slice(j))?.[0] ?? "";
					j += delim.length;
				}
				if (delim) heredocs.push({ delim, strip });
				i = j;
				continue;
			}
			// `>`, `>>`, `<`, `<>`, `<<<`, `>&`: the operator is not a word, its target is data.
			// An input redirect hands the program text this guard cannot read
			// (`sh < script.sh`), so the segment is marked and reported opaque.
			if (ch === "<") pendingStdin = true;
			i += s[i + 1] === ch || s[i + 1] === "&" || (ch === "<" && s[i + 1] === ">") ? 2 : 1;
			continue;
		}
		if (ch === "(" || ch === ")") {
			endSegment();
			i++;
			continue;
		}
		if (ch === " " || ch === "\t" || ch === "\r") {
			endWord();
			i++;
			continue;
		}
		buf += ch;
		started = true;
		i++;
	}
	endSegment();

	if (depth < MAX_RECURSION) {
		for (const inner of substitutions) segments.push(...tokenize(inner, depth + 1, payloads));
		// A command handed to another program is checked by the SAME checks as a
		// top-level one: a shell payload is tokenized as a command, and an executor
		// that takes an argument list (`docker run img <cmd>`, `find -exec <cmd>`)
		// contributes those words as a segment of its own. Only an interpreter
		// payload (`python -c`, `node -e`, `perl -e`, `ruby -e`) is kept aside,
		// because the guard cannot parse the language it is written in.
		const work = [...segments];
		for (let qi = 0; qi < work.length; qi++) {
			const seg = work[qi];
			const reader = invocation(seg)?.program;
			const codeReader = isShell(reader) || (reader !== undefined && isInterpreter(reader));
			if (codeReader && (PIPE_FED.has(seg) || STDIN_FED.has(seg))) {
				// `echo 'pip install x' | sh` runs the PRODUCER's output: the text this
				// consumer executes is not in its own words. It is read from the
				// producer when the producer is statically known, and the consumer is
				// reported OPAQUE when it is not (`curl … | sh`, `cat file | sh`,
				// `sh < script.sh`) — the fail-closed answer (PR #106 round 4, F1).
				const text = PIPE_FED.has(seg) ? staticText(work[qi - 1], substitutions) : null;
				if (text === null) {
					OPAQUE_STDIN.add(seg);
					continue;
				}
				if (isShell(reader)) {
					const produced = tokenize(text, depth + 1, payloads);
					segments.push(...produced);
					work.push(...produced);
				} else {
					payloads.push({ program: reader as string, text, shell: false });
				}
				continue;
			}
			const inner = shellCArgument(seg);
			if (inner !== null) {
				const produced = tokenize(inner, depth + 1, payloads);
				segments.push(...produced);
				work.push(...produced);
				// A substitution inside the argument is code too: `sh -c "$(echo '…')"`
				// reads as an empty `-c` argument with the substitution stripped out, so
				// what the shell runs was never judged. `eval` already resolves this
				// shape; the `-c` paths did not (PR #106 round 4, F3).
				for (const sub of substitutions) payloads.push({ program: "sh", text: sub, shell: false });
			}
			const inv = invocation(seg);
			if (inv?.program === "eval") {
				// `eval` runs its ARGUMENTS as a command, and a substitution's
				// output with them: `eval "$(echo pip install x)"` runs pip.
				const text = inv.args.map((w) => w.text).join(" ").trim();
				if (text) {
					const produced = tokenize(text, depth + 1, payloads);
					segments.push(...produced);
					work.push(...produced);
				}
				for (const sub of substitutions) payloads.push({ program: "eval", text: sub, shell: false });
				continue;
			}
			const payload = executorPayload(seg);
			if (!payload) continue;
			if (payload.words) {
				segments.push(payload.words);
				work.push(payload.words);
				continue;
			}
			if (payload.shell) {
				const produced = tokenize(payload.text, depth + 1, payloads);
				segments.push(...produced);
				work.push(...produced);
				continue;
			}
			payloads.push(payload);
			// The same shape as the `-c` case above, one language out: the code
			// argument of an interpreter can carry a substitution, and the text that
			// substitution produces is code in that language (F3).
			for (const sub of substitutions) payloads.push({ program: payload.program, text: sub, shell: false });
		}
	}
	return segments;
}

/** The argument of a shell's `-c` flag, when this simple command is one. */
function shellCArgument(words: Segment): string | null {
	const inv = invocation(words);
	if (!inv || SHELLS[inv.program] !== true) return null;
	for (let i = 0; i < inv.args.length; i++) {
		const t = inv.args[i].text;
		if (t === "--") break;
		if (t === "-c" || /^-[A-Za-z]*c[A-Za-z]*$/.test(t)) return inv.args[i + 1]?.text ?? null;
	}
	return null;
}

/** `find` flags whose argument is a command. */
const FIND_EXEC_FLAGS: Record<string, true> = { "-exec": true, "-execdir": true, "-ok": true, "-okdir": true };

/** `docker`/`podman` flags that consume the next word, so the image or service can be found. */
const DOCKER_VALUE_FLAGS: Record<string, true> = {
	"-e": true, "--env": true, "-v": true, "--volume": true, "-p": true, "--publish": true, "-w": true,
	"--workdir": true, "-u": true, "--user": true, "--name": true, "--network": true, "--net": true,
	"--entrypoint": true, "-m": true, "--memory": true, "--env-file": true, "-l": true, "--label": true,
	"--mount": true, "--add-host": true, "--platform": true, "--pull": true, "--log-driver": true,
	"--log-opt": true, "--restart": true, "--cap-add": true, "--cap-drop": true, "--device": true,
	"--dns": true, "--hostname": true, "-h": true, "--ip": true, "--link": true, "--security-opt": true,
	"--sysctl": true, "--tmpfs": true, "--ulimit": true, "--userns": true, "--volume-driver": true,
	"--volumes-from": true, "-c": true, "--cpu-shares": true, "--cpuset-cpus": true, "--memory-swap": true,
	"-a": true, "--attach": true, "--gpus": true, "--pid": true, "--uts": true, "--ipc": true,
	"--shm-size": true, "--stop-signal": true, "--health-cmd": true, "--health-interval": true,
	"--health-retries": true, "--health-timeout": true, "--health-start-period": true, "--profile": true,
};

/** `ssh` flags that consume the next word. */
const SSH_VALUE_FLAGS: Record<string, true> = {
	"-p": true, "-i": true, "-o": true, "-l": true, "-F": true, "-J": true, "-L": true, "-R": true, "-D": true,
	"-b": true, "-c": true, "-m": true, "-E": true, "-Q": true, "-S": true, "-W": true, "-e": true, "-I": true,
	"-O": true, "-w": true,
};

/** Whether a program runs shell code handed to it as a string. */
const isShell = (program: string | undefined): boolean => program !== undefined && SHELLS[program] === true;
/** Whether a program evaluates a string in its OWN language, not in a shell. */
const isInterpreter = (program: string): boolean =>
	/^python[0-9.]*$/.test(program) || program === "node" || program === "bun" || program === "perl" || program === "ruby";

/** `env -S`/`--split-string`'s value, when this command hands one to env. */
function envSplitString(words: Segment): string | null {
	let head = 0;
	while (head < words.length) {
		if (!words[head].quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[head].text)) { head++; continue; }
		const program = words[head].quoted ? "" : baseName(words[head].text);
		if (program === "env") {
			for (let i = head + 1; i < words.length; i++) {
				const t = words[i].text;
				if (t === "-S" || t === "--split-string") return words[i + 1]?.text ?? null;
				if (t.startsWith("--split-string=")) return t.slice("--split-string=".length);
				if (t.startsWith("-S") && t.length > 2) return t.slice(2);
			}
			return null;
		}
		if (WRAPPERS[program] !== true) return null;
		head = skipFlags(words, head + 1, WRAPPER_VALUE_FLAGS[program] ?? NO_FLAGS);
	}
	return null;
}

/**
 * The code a program will RUN, when this simple command hands it one.
 *
 * The program a command names is not always the program that runs the banned
 * command: `python -c "os.system('pip install x')"` runs pip, and so do
 * `ssh box 'pip install x'`, `docker run img pip install x` and a heredoc a
 * shell reads as its stdin. Each of these was refused by the text matcher and
 * allowed by the structural one (review of PR #106, finding 3), so the payload
 * is resolved here and checked in its own right: shell payloads are tokenized
 * as commands, and a non-shell payload (`python -c`, `node -e`, `perl -e`,
 * `docker run`) is matched by text, because the guard cannot parse the
 * language. `null` when this command hands nothing to another program.
 */
function executorPayload(words: Segment): Payload | null {
	// `env -S '<string>'` / `--split-string <string>`: env splits the string itself
	// and execs the result, so the string is a command line. Resolved FIRST: the
	// string is env's whole command, so `invocation` would find no program at all.
	// (env also appends words that follow the value — `env -S sh -c 'pip install
	// x'` runs pip — and those are covered by the program-less rule in
	// `segmentUnderstood`: the line ends on a quoted word, so it is not understood
	// and the text verdict stands. Verified by mutation: a guard here is
	// unreachable in effect.)
	const splitString = envSplitString(words);
	if (splitString !== null) return { program: "env", text: splitString, shell: true };
	const inv = invocation(words);
	if (!inv) return null;
	const { program, args } = inv;
	if (program === "ssh") {
		let i = 0;
		while (i < args.length && args[i].text.startsWith("-")) i += SSH_VALUE_FLAGS[args[i].text] === true ? 2 : 1;
		i++; // the host
		const rest = args.slice(i);
		// The remote shell joins the remaining words with spaces and runs them, so
		// the payload is a command LINE, not an argument list.
		return rest.length ? { program, text: rest.map((w) => w.text).join(" "), shell: true } : null;
	}
	if (program === "docker" || program === "podman" || program === "docker-compose") {
		let i = 0;
		if (args[i]?.text === "compose") i++;
		const sub = args[i]?.text;
		if (sub !== "run" && sub !== "exec" && sub !== "create") return null;
		i++;
		i = skipFlags(args, i, DOCKER_VALUE_FLAGS);
		const image = args[i]; // the image, or the compose service
		if (!image) return null;
		const command = args.slice(i + 1);
		// `docker run` execs the words after the image directly, so the payload is
		// that argument list — no shell, no re-quoting.
		return command.length ? { program, text: command.map((w) => w.text).join(" "), shell: false, words: command } : null;
	}
	// `find . -exec <cmd> … \;`: find execs the words after the flag, up to `;` or `+`.
	if (program === "find") {
		const start = args.findIndex((w) => FIND_EXEC_FLAGS[w.text] === true);
		if (start === -1) return null;
		const rest = args.slice(start + 1);
		const end = rest.findIndex((w) => w.text === ";" || w.text === "+");
		const command = end === -1 ? rest : rest.slice(0, end);
		return command.length ? { program, text: command.map((w) => w.text).join(" "), shell: false, words: command } : null;
	}
	if (!isInterpreter(program)) return null;
	const scan = interpreterScan(program, args);
	return scan.code === null ? null : { program, text: scan.code, shell: false };
}

/** Single-dash clusters that carry code for perl and ruby (`-pe`, `-ne`, `-E`). */
const CODE_CLUSTER: Record<string, RegExp> = { perl: /^-[A-Za-z]*[eE][A-Za-z]*$/, ruby: /^-[A-Za-z]*e[A-Za-z]*$/ };

/** Flags an interpreter accepts without changing what it runs. */
const INTERPRETER_INERT_FLAGS: Record<string, Record<string, true>> = {
	python: { "-u": true, "-B": true, "-s": true, "-S": true, "-E": true, "-O": true, "-OO": true },
	perl: { "-w": true, "-W": true },
	ruby: { "-w": true, "-W": true },
	node: {},
	bun: {},
};

/** The family an interpreter belongs to, for the flag tables above. */
function interpreterFamily(program: string): string {
	return /^python[0-9.]*$/.test(program) ? "python" : program;
}

interface InterpreterScan {
	/** The code the interpreter will run from a flag, when one is found. */
	code: string | null;
	/** True when an argument is a route this guard does not model. */
	opaque: boolean;
}

/**
 * What an interpreter does with its arguments.
 *
 * The table used to know only `-c` and `-e`/`--eval`, so `node -p '…'`,
 * `perl -E '…'` and `ruby -pe '…'` were modelled, read as "understood", and
 * ALLOWED while the text matcher blocked them (PR #106 round 4, F2). The same
 * shape as round 3's `timeout` value flags: an incomplete table under a program
 * the guard DOES model, where the fail-closed gate cannot help.
 *
 * Everything that is neither a code flag nor a known-inert flag — `-m`, `-r`,
 * `-i`, `-x`, a script path, an unknown long flag — is a route this guard does
 * not model, so `opaque` is set and the fail-closed combiner keeps the text
 * verdict. That is the safe direction: it can only ADD blocks, never remove one.
 */
function interpreterScan(program: string, args: Segment): InterpreterScan {
	const family = interpreterFamily(program);
	const inert = INTERPRETER_INERT_FLAGS[family] ?? {};
	const cluster = CODE_CLUSTER[family];
	const nodeish = family === "node" || family === "bun";
	for (let i = 0; i < args.length; i++) {
		const t = args[i].text;
		if (t === "--") return { code: null, opaque: true };
		if (inert[t] === true) continue;
		if (family === "python") {
			if (t === "-c") return { code: args[i + 1]?.text ?? "", opaque: false };
			if (t.startsWith("-c") && t.length > 2) return { code: t.slice(2), opaque: false };
			return { code: null, opaque: true };
		}
		// `-p` is code for node (`--print`) and a loop flag for perl and ruby; `-E`
		// is code for perl and an ENCODING for ruby. A family-blind table would read
		// `perl -p -e '…'` as code `-e` and `ruby -E utf-8 -e '…'` as code `utf-8`,
		// understand the segment, and drop the text hit.
		if (t === "-e" || t === "--eval" || (nodeish && (t === "-p" || t === "--print")) || (family === "perl" && t === "-E")) {
			return { code: args[i + 1]?.text ?? "", opaque: false };
		}
		if (t.startsWith("--eval=")) return { code: t.slice("--eval=".length), opaque: false };
		if (nodeish && t.startsWith("--print=")) return { code: t.slice("--print=".length), opaque: false };
		if (cluster?.test(t)) {
			// `perl -pe '…'`, `ruby -ne '…'`: the code follows the cluster, or trails
			// inside it.
			const at = t.search(/[eE]/);
			return { code: at >= 0 && at + 1 < t.length ? t.slice(at + 1) : (args[i + 1]?.text ?? ""), opaque: false };
		}
		// A perl or ruby loop flag carries no code: `perl -p -e '…'` is ordinary.
		if (!nodeish && /^-[A-Za-z]+$/.test(t) && !/[eE]/.test(t)) continue;
		return { code: null, opaque: true };
	}
	return { code: null, opaque: false };
}

/** Whether an interpreter's arguments are a route this guard does not model. */
function interpreterOpaque(program: string, args: Segment): boolean {
	return interpreterScan(program, args).opaque;
}

interface Invocation {
	program: string;
	args: Segment;
}

/**
 * The program a simple command runs, with wrappers resolved.
 *
 * Returns null when there is no program: a quoted word is data (it never names
 * a program), and a command made only of assignments or flags runs nothing.
 */
function invocation(words: Segment): Invocation | null {
	let i = 0;
	for (let hop = 0; hop <= 5; hop++) {
		while (i < words.length && !words[i].quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i].text)) i++;
		// A shell keyword introduces a command list: the program follows it.
		while (i < words.length && !words[i].quoted && SHELL_KEYWORDS[words[i].text] === true) i++;
		if (i >= words.length) return null;
		if (words[i].quoted) return null;
		const program = baseName(words[i].text);
		const args = words.slice(i + 1);
		if (program === "uv" && args[0]?.text === "run") {
			i = skipFlags(words, i + 2, UV_RUN_VALUE_FLAGS);
			continue;
		}
		if (program === "uv" && args[0]?.text === "tool" && args[1]?.text === "run") {
			// `uv tool run <cmd>` is `uvx <cmd>`: it runs the command from an
			// ephemeral environment, so `uv tool run pip install x` runs pip while
			// the segment read as uv's own and the text hit was dropped (PR #106
			// round 4, F4).
			i = skipFlags(words, i + 3, UV_RUN_VALUE_FLAGS);
			continue;
		}
		if (program === "uvx") {
			i = skipFlags(words, i + 1, UV_RUN_VALUE_FLAGS);
			continue;
		}
		if (program === "timeout") {
			// `timeout 5 cmd`: the duration is a positional argument, not a flag.
			i = skipFlags(words, i + 1, WRAPPER_VALUE_FLAGS.timeout ?? NO_FLAGS) + 1;
			continue;
		}
		if (WRAPPERS[program] === true) {
			i = skipFlags(words, i + 1, WRAPPER_VALUE_FLAGS[program] ?? NO_FLAGS);
			continue;
		}
		return { program, args };
	}
	return null;
}

const GIT_GLOBAL_VALUE_FLAGS: Record<string, true> = {
	"-C": true, "-c": true, "--git-dir": true, "--work-tree": true, "--namespace": true, "--exec-path": true,
	"--config-env": true, "--super-prefix": true, "--shallow-file": true, "--attr-source": true,
};

interface GitCommand {
	/** The subcommand, after any global options. */
	sub: string;
	/** The words after the subcommand. */
	args: Segment;
	/** True when a global `-C <path>` precedes the subcommand: another repo. */
	dashC: boolean;
}

/**
 * A git invocation, with its global options resolved.
 *
 * The global options are why this exists: `git -C <repo> checkout -b release/x`
 * and `git --work-tree /x checkout -b release/z` are ordinary creations, and the
 * text matchers that required `checkout` right after `git` reported a pass for
 * every variant they could not see (measured 2026-09-17 and 2026-10-11).
 * `--opt value` and `--opt=value` are both read, so a space-separated value no
 * longer hides the subcommand.
 */
function gitCommand(words: Segment): GitCommand | null {
	const inv = invocation(words);
	if (!inv || inv.program !== "git") return null;
	let dashC = false;
	let i = 0;
	while (i < inv.args.length) {
		const t = inv.args[i].text;
		if (t.startsWith("-") && t !== "-") {
			if (t === "-C") dashC = true;
			i += !t.includes("=") && GIT_GLOBAL_VALUE_FLAGS[t] === true ? 2 : 1;
			continue;
		}
		return { sub: t, args: inv.args.slice(i + 1), dashC };
	}
	return null;
}

const GH_GLOBAL_VALUE_FLAGS: Record<string, true> = { "-R": true, "--repo": true, "--hostname": true };

interface GhCommand {
	sub: string;
	verb: string;
	/** The words after the subcommand, verb included. */
	tail: Segment;
	/** The words after the verb. */
	args: Segment;
	/** The global flags that sat before the subcommand. */
	globals: Segment;
}

/** A gh invocation: subcommand, verb and the words after them. */
function ghCommand(words: Segment): GhCommand | null {
	const inv = invocation(words);
	if (!inv || inv.program !== "gh") return null;
	const i = skipFlags(inv.args, 0, GH_GLOBAL_VALUE_FLAGS);
	const tail = inv.args.slice(i + 1);
	return { sub: inv.args[i]?.text ?? "", verb: tail[0]?.text ?? "", tail, args: tail.slice(1), globals: inv.args.slice(0, i) };
}

/**
 * The repository a gh invocation explicitly names, as `owner/name`, or null.
 *
 * `gh pr merge` takes `-R, --repo [HOST/]OWNER/REPO` and a PR URL names its own
 * repository. Both matter to the merge gate: it reads the checks of the repo the
 * command actually targets, and a same-numbered PR in the session's repo is a
 * different PR. A value gh itself would reject (no `/`) is not resolved here.
 */
function namedRepo(words: Segment): string | null {
	for (let i = 0; i < words.length; i++) {
		const t = words[i].text;
		const value = t === "-R" || t === "--repo" ? words[i + 1]?.text : t.startsWith("--repo=") ? t.slice("--repo=".length) : undefined;
		if (!value) continue;
		const parts = value.split("/").filter(Boolean);
		if (parts.length >= 2) return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
	}
	return null;
}

/** The first positional word of an argument list, skipping flags and their values. */
function firstPositional(args: Segment, valueFlags: Record<string, true>): Word | null {
	const i = skipFlags(args, 0, valueFlags);
	return i < args.length ? args[i] : null;
}

/** Whether a merge invocation names a method that is not a merge commit. */
function squashLike(words: Segment): boolean {
	for (let i = 0; i < words.length; i++) {
		const t = words[i].text;
		if (t === "--squash" || t === "--rebase") return true;
		if (t === "--merge-method") {
			const v = words[i + 1]?.text;
			if (v === "squash" || v === "rebase") return true;
		}
		if (t.startsWith("--merge-method=")) {
			const v = t.slice("--merge-method=".length);
			if (v === "squash" || v === "rebase") return true;
		}
	}
	return false;
}

/**
 * The branch names a git invocation creates.
 *
 * Every creating form the guard knows: `checkout -b|-B|--orphan` and `switch
 * -c|-C|--create|--force-create` (the HEAD-moving ones, shared with the chain
 * allowance), `worktree add -b|-B`, and a bare `git branch <name>` (creation),
 * which is told apart from the querying, deleting and renaming forms by the
 * flags they carry. `git branch -c|-C|--copy` names its new branch last.
 */
function createdBranchNames(g: GitCommand): string[] {
	if (g.sub === "checkout" || g.sub === "switch") return headMovingNames(g).filter(Boolean);
	const args = g.args;
	if (g.sub === "worktree") {
		if (args[0]?.text !== "add") return [];
		const names: string[] = [];
		for (let i = 0; i < args.length; i++) {
			if (args[i].text === "-b" || args[i].text === "-B") {
				const name = args[i + 1]?.text;
				if (name) names.push(name);
			}
		}
		return names;
	}
	if (g.sub !== "branch") return [];
	if (args.some((w) => BRANCH_QUERY_FLAGS[w.text] === true)) return [];
	const positional: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const t = args[i].text;
		if (t.startsWith("-") && t !== "-") {
			if (!t.includes("=") && BRANCH_OTHER_VALUE_FLAGS[t] === true) i++;
			continue;
		}
		positional.push(t);
	}
	const copying = args.some((w) => w.text === "-c" || w.text === "-C" || w.text === "--copy");
	if (!positional.length) return [];
	return [copying ? positional[positional.length - 1] : positional[0]];
}

/** `git branch` flags that only query, delete, move or configure: no creation. */
const BRANCH_QUERY_FLAGS: Record<string, true> = {
	"-d": true, "-D": true, "--delete": true, "-m": true, "-M": true, "--move": true, "-l": true, "--list": true,
	"--show-current": true, "--contains": true, "--no-contains": true, "--merged": true, "--no-merged": true,
	"--points-at": true, "--format": true, "--sort": true, "--column": true, "-v": true, "-vv": true,
	"--verbose": true, "-a": true, "--all": true, "-r": true, "--remotes": true, "--edit-description": true,
	"--set-upstream-to": true, "-u": true, "--unset-upstream": true, "--track": true, "--no-track": true,
	"--color": true, "--no-color": true, "-i": true, "--ignore-case": true, "--no-abbrev": true, "--abbrev": true,
};
/** `git branch` flags that consume the next word as a value. */
const BRANCH_OTHER_VALUE_FLAGS: Record<string, true> = {
	"--points-at": true, "--contains": true, "--no-contains": true, "--merged": true, "--no-merged": true,
	"--set-upstream-to": true,
};

/**
 * The names of a HEAD-moving creation, or an empty list.
 *
 * Only these move HEAD to the new branch, which is what the chain allowance
 * below must prove: `git branch x` creates `x` without checking it out, so a
 * commit after it still lands on the old branch.
 */
function headMovingNames(g: GitCommand): string[] {
	if (g.sub !== "checkout" && g.sub !== "switch") return [];
	const flags = g.sub === "checkout" ? ["-b", "-B", "--orphan"] : ["-c", "-C", "--create", "--force-create"];
	const names: string[] = [];
	for (let i = 0; i < g.args.length; i++) {
		if (flags.includes(g.args[i].text)) names.push(g.args[i + 1]?.text ?? "");
	}
	return names;
}

/** `gh stack init|add` flags that consume the next word as their value. */
const STACK_NAME_VALUE_FLAGS: Record<string, true> = { "-b": true, "--base": true, "-m": true, "--message": true };

/** The branch names a `gh stack init|add` argument list asks for. */
function stackBranchNames(args: Segment): string[] {
	const names: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const t = args[i].text;
		if (t.startsWith("-") && t !== "-") {
			const takesValue = !t.includes("=") && (STACK_NAME_VALUE_FLAGS[t] === true || /^-[A-Za-z]*m$/.test(t));
			if (takesValue) i++;
			continue;
		}
		names.push(t);
	}
	return names;
}

/**
 * The message of a commit, read from its own words.
 *
 * The `-m`/`--message` flag and its value, or a short cluster that ends in `m`
 * (`-am`, `-nm`, `-Sm`), whose value is the rest of the word or the next one.
 * This replaced a pattern that searched the whole command for `-m` as a
 * STANDALONE token; that pattern was itself a fix for two measured failures —
 * a `-m` inside a hyphenated word (`joint-most-fired`, `plan-msg.txt`) read as
 * the flag plus a bogus message, and the old bare `-m` finding the `-m` inside
 * `--message` and capturing "essage". Reading the flag where the shell puts it —
 * among the commit's own words — makes both impossible, and reads `-am` too,
 * which the token pattern never saw.
 *
 * Returns null when the commit carries no message flag: an editor opens, the
 * message is unknown, and the check allows it.
 */
function commitMessage(args: Segment): string | null {
	for (let i = 0; i < args.length; i++) {
		const t = args[i].text;
		if (t === "-m" || t === "--message") return args[i + 1]?.text ?? "";
		if (t.startsWith("--message=")) return t.slice("--message=".length);
		if (t.startsWith("-") && !t.startsWith("--")) {
			const m = t.indexOf("m", 1);
			if (m >= 0) return t.slice(m + 1) || (args[i + 1]?.text ?? "");
		}
	}
	return null;
}

/** Whether a `gh api` argument list sends a body: the POST routes, per gh's own defaults. */
function apiWrites(args: Segment): boolean {
	for (let i = 0; i < args.length; i++) {
		const t = args[i].text;
		const method = /^(?:-X|--method)(?:=(.*))?$/.exec(t);
		if (method) {
			if ((method[1] ?? args[i + 1]?.text ?? "").toUpperCase() === "POST") return true;
			continue;
		}
		if (/^-X./.test(t) && t.slice(2).toUpperCase() === "POST") return true;
		if (t === "-f" || t === "-F" || t === "--field" || t === "--raw-field" || t === "--input") return true;
		if (/^-(?:f|F)./.test(t) || /^--(?:field|raw-field|input)=/.test(t)) return true;
	}
	return false;
}

/**
 * Text rules for a payload the guard cannot parse: code handed to a non-shell
 * interpreter.
 *
 * Conservative by decision (review of PR #106, finding 3): the guard cannot read
 * Python or JavaScript, so a payload of that kind is matched by TEXT with the
 * same intent the pre-structural matcher had, and a hit refuses the command. The
 * branch-name rule is the one exception to "text is enough": a name that already
 * carries a kind prefix is not a hit, so a legitimate
 * `python -c "…git checkout -b feature/x…"` is not refused.
 */
const PAYLOAD_RULES: { why: string; pattern: RegExp }[] = [
	{ why: "pip install", pattern: /(?:^|[^A-Za-z0-9_-])(?:pip|pip3)(?:\.[A-Za-z]+)?\s+install\b/ },
	{ why: "python -m pip install", pattern: /(?:^|[^A-Za-z0-9_-])python[0-9.]*\s+-m\s+pip\s+install\b/ },
	{ why: "powershell", pattern: /(?:^|[^A-Za-z0-9_-])(?:powershell|pwsh)(?:\.exe)?(?![A-Za-z0-9_-])/i },
	{
		why: "push to main",
		pattern: /(?:^|[^A-Za-z0-9_-])git\s+(?:-[cC]\s+\S+\s+|--[A-Za-z-]+(?:=\S+)?\s+)*push\b[^\n;|&]*\b(?:main|master)\b/,
	},
	{
		why: "branch creation",
		pattern:
			/(?:^|[^A-Za-z0-9_-])git\s+(?:-[cC]\s+\S+\s+|--[A-Za-z-]+(?:=\S+)?\s+)*(?:checkout\s+-[bB]|switch\s+(?:-c|-C|--create|--force-create)|branch\s+(?!-)|worktree\s+add\s+-[bB])\s*['"]?([^\s'";|&]+)/,
	},
	{ why: "bare merge", pattern: /(?:^|[^A-Za-z0-9_-])(?:git|gh\s+(?:pr|stack))\s+merge(?![\w-])(?![^\n]*(?:--squash|--rebase|--merge-method))/ },
	{ why: "issue creation", pattern: /(?:^|[^A-Za-z0-9_-])gh\s+issue\s+create(?![\w-])/ },
	{
		why: "issue creation",
		pattern: /(?:^|[^A-Za-z0-9_-])gh\s+api\b(?=[^\n]*\/issues\b)(?=[^\n]*(?:--field|--raw-field|--input|--method|-f|-F|-X)\b)/,
	},
];

/** The first payload rule this text trips, as a phrase for the reason, or null. */
function payloadHit(text: string): string | null {
	for (const rule of PAYLOAD_RULES) {
		const hit = rule.pattern.exec(text);
		if (!hit) continue;
		if (rule.why === "branch creation" && hit[1] && BRANCH_OK.test(hit[1])) continue;
		return rule.why;
	}
	return null;
}


/**
 * ── THE FAIL-CLOSED VERDICT (OMP-13, PR #106 round 4) ──────────────────────
 *
 * THIS GUARD IS A MISTAKE-PROOFING FLOOR FOR COOPERATIVE AGENTS, NOT A SECURITY
 * BOUNDARY. It exists so the ordinary wrong command is refused at the point of
 * failure, with the positive instruction attached. It does not, and cannot,
 * contain an agent that sets out to route around it: aliases, functions, a
 * variable in command position, `base64 | sh`, a committed script — none of
 * those are read here, and chasing them is an arms race with no end. Measured:
 * Claude Code gates bash with tree-sitter-bash and FAILS CLOSED, treating any
 * node type outside its allowlist as `too-complex` (anthropics/claude-code
 * #20254); a denylist-plus-allowlist design elsewhere took twelve review rounds
 * and each round found a new way out (yohan-work/poko#22); and the dcg
 * evaluation in `agent/docs/research/dcg-command-guard-eval.md` measured the same
 * thing for a rule pack (33/33 on the forms its scope list was derived from,
 * 6-7/10 on fresh ones). Read the block messages as corrections, not as a
 * boundary that holds under pressure.
 *
 * THE RULE. Every check has two views of the same rule:
 *   - `check.match` — the TEXT matcher. It is what `origin/main` blocks, unchanged,
 *     and it is the FLOOR: nothing it blocks is allowed here.
 *   - `STRUCTURAL[id]` — the same rule read from shell structure: the program that
 *     will actually run, with quotes, heredoc bodies and flag values as DATA.
 * The structural view may ALLOW what the text view blocks in exactly one case:
 * when the whole command is UNDERSTOOD — every segment's program is one this
 * guard models (or a program whose arguments are inert data), every payload form
 * is one it resolves, and nothing is left unclassified. Then a text hit with no
 * structural counterpart is a false positive by construction (the phrase lived in
 * data), and the command is allowed.
 *
 * Anything NOT understood keeps the text verdict, block or allow. That is what
 * makes an under-block impossible by construction: `ssh box -- pip install x`,
 * `docker compose -f x.yml run svc pip install x`, `doas pip install x` and
 * `timeout -s KILL 5 pip install x` are all unmodelled, so main's block stands.
 * The wrapper table is deliberately NOT grown to catch them — the property test
 * (`command-guard-property.test.ts`) is the acceptance instead: over the whole
 * differential corpus and a generated cartesian of wrappers × payload forms ×
 * banned commands, this guard must block whenever the frozen reference blocks,
 * except for the audited false-positive families listed in
 * `fixtures/false-positive-families.md`.
 */

/** What a check sees: the raw text, its shell structure, and any interpreter payloads. */
interface Ctx {
	raw: string;
	segments: Segment[];
	payloads: Payload[];
	/** True when EVERY segment is classified by a known grammar (see the block above). */
	understood: boolean;
}

/**
 * Programs whose ARGUMENTS are inert data: nothing in them is a command. A
 * phrase inside their words is text, so a text hit with no structural
 * counterpart is a false positive.
 *
 * The list is short on purpose. `awk`, `sed`, `watch`, `parallel` and every
 * wrapper are NOT here: their arguments can run a command (`awk 'BEGIN{system(…)}'`,
 * `sed -e 'e cmd'`, `watch cmd`), so an unmodelled program keeps the text
 * verdict. Growing this list is not how a false positive gets fixed — the
 * property test is.
 */
const DATA_PROGRAMS: Record<string, true> = {
	echo: true, printf: true, cat: true, grep: true, rg: true, ls: true, wc: true, head: true, tail: true,
	sort: true, uniq: true, cut: true, tr: true, pwd: true, basename: true, dirname: true, test: true,
	true: true, false: true, make: true,
};

/** Programs the guard models: its own subjects, the shells, the interpreters, the packagers. */
const MODELLED_PROGRAMS: Record<string, true> = {
	git: true, gh: true, backlog: true, uv: true, pip: true, pip3: true, pipx: true, poetry: true,
	python: true, python3: true, py: true, node: true, bun: true, deno: true, perl: true, ruby: true,
	powershell: true, pwsh: true, npm: true, npx: true, yarn: true, pnpm: true,
	// A shell's own argument (`-c '…'`, a heredoc it reads) is tokenized as a
	// command by `tokenize`, so the shell itself is understood. `eval` is the same
	// idea: its arguments ARE the command. (SHELLS is declared further down and is
	// the same set; spreading it here would read it before initialization.)
	sh: true, bash: true, dash: true, zsh: true, ksh: true, ash: true,
	eval: true,
};

/** Programs that hand their payload to another program; resolved by `executorPayload`. */
const EXECUTORS: Record<string, true> = {
	ssh: true, docker: true, podman: true, "docker-compose": true, find: true, env: true, xargs: true,
};

/** Whether one segment is classified by a known grammar. */
function segmentUnderstood(seg: Segment): boolean {
	// A code consumer whose stdin text the guard could not read runs something it
	// never saw (`curl … | sh`, `sh < script.sh`): the text verdict stands.
	if (OPAQUE_STDIN.has(seg)) return false;
	const inv = invocation(seg);
	if (!inv) {
		// No program found. Either the segment is pure assignments and shell
		// keywords — it runs nothing — or the program position holds a quoted word
		// the shell would RUN (`'pip' install x`), which is not understood. The
		// first-word heuristic that used to sit here was wrong for a WRAPPER that
		// consumes the line and leaves the quoted word further in: `env -S sh -c
		// 'pip install x'` has `env` in front, so it read as understood and the
		// command was allowed while the text guard blocked it (found by the
		// generated property test). Any quoted word in a program-less segment means
		// the line was not fully resolved, so the text verdict stands.
		return !seg.some((w) => w.quoted);
	}
	if (EXECUTORS[inv.program] === true) return executorPayload(seg) !== null;
	if (isInterpreter(inv.program)) {
		// A modelled interpreter is understood only while its arguments are a route
		// this guard models. An unknown flag (`-m`, `-r`, `-i`), a script path or a
		// bare word is code the guard cannot read, so the text verdict stands — the
		// safe direction, which can only add blocks (PR #106 round 4, F2).
		return !interpreterOpaque(inv.program, inv.args);
	}
	return DATA_PROGRAMS[inv.program] === true || MODELLED_PROGRAMS[inv.program] === true;
}

/** Tokenize once, and decide whether every segment is understood. */
function analyse(command: string): Ctx {
	const payloads: Payload[] = [];
	const segments = tokenize(command, 0, payloads);
	return { raw: command, segments, payloads, understood: segments.every(segmentUnderstood) };
}

/**
 * The same rules, read from structure. Each returns the offending fragment or
 * null, exactly like `Check.match`; the pair is combined by the handler.
 */
const STRUCTURAL: Record<string, (c: Ctx) => string | null> = {
	// Only an INTERPRETER payload reaches this: `python -c`, `node -e`, `perl -e`,
	// `ruby -e`, an `eval` substitution. A shell payload (`ssh`, `sh -c`, `env -S`,
	// `docker run`, `find -exec`) is tokenized and judged by the checks above.
	"executor-payload": (c) => {
		for (const p of c.payloads) {
			const hit = payloadHit(p.text);
			if (hit) return `${hit} in the ${p.program} payload: ${p.text.slice(0, 80)}`;
		}
		return null;
	},
	// The command that RUNS pip, not the word: `echo "pip install x"` is data, and
	// `uv pip install` is a different program (uv), sanctioned as it always was.
	// `uv run <cmd>` is a wrapper, so `uv run pip install x` still blocks.
	"uv-not-pip": (c) => {
		for (const seg of c.segments) {
			const inv = invocation(seg);
			if (!inv) continue;
			if (/^pip[0-9]*$/.test(inv.program) && inv.args[0]?.text === "install") return `${inv.program} install`;
			if (/^(?:python[0-9.]*|py)$/.test(inv.program)) {
				const at = inv.args.findIndex((w) => w.text === "-m");
				const mod = at >= 0 ? (inv.args[at + 1]?.text ?? "") : "";
				if (/^pip[0-9]*$/.test(mod) && inv.args[at + 2]?.text === "install") {
					return `${inv.program} -m ${mod} install`;
				}
			}
		}
		return null;
	},
	// The program being run, not the word: a string literal, a heredoc or a search
	// pattern that names PowerShell is data. `bash -c "powershell -c x"` is not,
	// because the `-c` argument is tokenized as a command.
	"no-powershell": (c) => {
		for (const seg of c.segments) {
			const inv = invocation(seg);
			if (inv && (inv.program === "powershell" || inv.program === "pwsh")) return inv.program;
		}
		return null;
	},
	// The explicit-ref form (`git push origin main`), which reaches here from any
	// branch that is not main — the branch block only covers standing ON main.
	"no-push-to-main": (c) => {
		for (const seg of c.segments) {
			const g = gitCommand(seg);
			if (!g || g.sub !== "push" || g.args.some((w) => w.text === "--help")) continue;
			const ref = g.args.find((w) => /(?:^|[:/])(?:main|master)$/.test(w.text));
			if (ref) return `git push … ${ref.text}`;
		}
		return null;
	},
	// The message is read from the commit's OWN words (see commitMessage), so a
	// heredoc body, a file path or another command's text cannot be mistaken for it.
	"conventional-commits": (c) => {
		for (const seg of c.segments) {
			const g = gitCommand(seg);
			if (!g || g.sub !== "commit") continue;
			const msg = commitMessage(g.args)?.trim();
			if (msg && !CONVENTIONAL.test(msg)) return msg;
		}
		return null;
	},
	// The subcommand is exact, so `git merge-base`/`merge-tree`/`merge-file` are a
	// different subcommand rather than a near-match, and the squash flag is read
	// from THIS simple command — `git merge x && echo --squash` no longer passes.
	"no-bare-merge": (c) => {
		for (const seg of c.segments) {
			const g = gitCommand(seg);
			if (g?.sub === "merge" && !squashLike(seg)) return "git merge";
			const gh = ghCommand(seg);
			if (!gh) continue;
			if ((gh.sub === "pr" || gh.sub === "stack") && gh.verb === "merge" && !squashLike(seg)) {
				return `gh ${gh.sub} merge`;
			}
		}
		return null;
	},
	// Every creating form in the command, not the first one the text showed: `-B`,
	// `switch --create`, `worktree add -b`, a bare `git branch <name>` and a second
	// creation in a chain are all read.
	"branch-naming": (c) => {
		for (const seg of c.segments) {
			const g = gitCommand(seg);
			if (g) {
				const bad = createdBranchNames(g).find((name) => !BRANCH_OK.test(name));
				if (bad) return bad;
			}
			const gh = ghCommand(seg);
			if (gh?.sub === "stack" && (gh.verb === "init" || gh.verb === "add")) {
				const names = stackBranchNames(gh.args);
				if (!names.length) {
					return `gh stack ${gh.verb} with no branch name (it would prompt, or generate a date-slug name)`;
				}
				const bad = names.find((name) => !BRANCH_OK.test(name));
				if (bad) return bad;
			}
		}
		return null;
	},
	// Two creation routes, both read from the gh command's own words: `gh issue
	// create`, and `gh api` POSTing to a repo's `/issues` collection. A quoted body
	// or a grep pattern that merely NAMES the command is data (OMP-11).
	"issues-in-backlog": (c) => {
		for (const seg of c.segments) {
			const gh = ghCommand(seg);
			if (!gh) continue;
			if (gh.sub === "issue" && gh.verb === "create") return "gh issue create";
			if (gh.sub !== "api") continue;
			const path = gh.tail.find((w) => /(?:^|\/)repos\/[^/\s]+\/[^/\s]+\/issues$/.test(w.text));
			if (path && apiWrites(gh.tail)) return `gh api … ${path.text}`;
		}
		return null;
	},
};

/** The one check with no text counterpart: an interpreter payload is always text. */
const PAYLOAD_CHECK: Check = {
	id: "executor-payload",
	match: () => null,
	reason:
		"A command handed to another program is still the command. This one is code for an interpreter the guard cannot " +
		"parse (`python -c`, `node -e`, `perl -e`, `ruby -e`, an `eval` substitution), so its text is matched instead: a " +
		"banned command named inside it is refused. Run it the sanctioned way, or take it out of the payload.",
};

const ALL_CHECKS: Check[] = [...CHECKS, PAYLOAD_CHECK];
