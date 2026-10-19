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
 * while writing documentation about this hook. Fix candidate: strip heredoc
 * bodies and quoted spans before matching.
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

		for (const check of CHECKS) {
			const hit = check.match(command);
			if (!hit) continue;
			if (check.id === "no-push-to-main" && (await createsProtected())) {
				pi.appendEntry(RECORD_TYPE, { guard: "bootstrap-first-push", cwd: ctx.cwd, at: new Date().toISOString() });
				continue;
			}

			pi.appendEntry(RECORD_TYPE, {
				guard: check.id,
				matched: hit.slice(0, 200),
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
