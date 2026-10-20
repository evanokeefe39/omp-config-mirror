---
name: git-conventions
description: >
  The git standard for every repo: conventional commits, branch prefixes, PR
  titles, squash-merge, versioning and releases with release-please, and the repo
  files that make them work (CONTRIBUTING.md, release-please config
  and workflow, PR-title check). Use when committing, branching, opening or merging
  a PR, releasing, or setting up a repo's git files. Relaxed for throwaway repos.
alwaysApply: true
---

# Git conventions

These apply to all professional repos (~90% of repos). For casual/throwaway
repos used as glorified backup, these can be relaxed — say so explicitly.

This skill is tracker-agnostic: it names no issue tracker. How a tracker's issues
attach to branches, PR titles and releases belongs to that tracker's own skill,
which builds on this one; nothing here depends on it. The order a new repo gets
these files in is `pb-new-project`.

## Precedence

Follow this repo's own git conventions when its `AGENTS.md` or
`CONTRIBUTING.md` defines them; otherwise follow this skill; otherwise use
the default linear workflow: branch off the default branch, conventional
commits, rebase to absorb upstream, squash-merge via PR, never commit to the
default branch. The command guard is a floor no local convention removes.

## Commits

```
type(scope): imperative short summary
```

| Type | When |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `refactor` | Code restructure, no behavior change |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `build` | Build system, dependencies |
| `ci` | CI configuration |
| `chore` | Maintenance, tooling |
| `revert` | Reverts an earlier commit |
| `style` | Formatting only |

**No bare commits.** Always use the `type(scope): ` prefix. The scope is
optional but the type+colon is mandatory. The command guard and the PR-title
check (`## Repo files`) accept exactly these eleven types.

## Commit identity

Every agent commit carries one trailer naming the agent that made it, so work can
be attributed to a harness version, an omp build and a model:

```
Agent-Identity: harness=omp-config-mirror@omp-home-v0.6.0+1 commit=a1b2c3d4e5f6-dirty-9f8e7d6c omp=18.12.2 model=claude-opus-5-5 session=01a12ab4
```

- **Written by machinery, never typed.** A global git hook
  (`~/.git-hooks/prepare-commit-msg`, installed from `agent/scripts/git-hooks/`)
  reads `OMP_IDENTITY`, which an omp extension captures at session start. An
  agent does nothing, and nothing has to remember.
- **Never `export OMP_IDENTITY` in an agent shell.** Every later commit in that
  shell reads the environment, so a probe that exports its own value re-stamps
  work that has nothing to do with it — measured 2026-10-19: two commits on a
  feature branch carried a headless probe's `session=`, and only
  `agent/scripts/omp-identity-rollup.sh` made the disagreement visible. Pass it
  per command instead: `env OMP_IDENTITY='…' bun agent/scripts/harness-identity.ts`.
- **The harness part names a release, not the private repo.** `~/.omp`
  (`omp-home`) is private, so `omp-home-v0.5.0` would resolve for nobody but its
  owner. Each release publishes the harness's mechanism — skills, rules, hooks,
  commands, extensions, scripts, agent definitions, config and release files, and
  nothing else — to the mirror
  [omp-config-mirror](https://github.com/evanokeefe39/omp-config-mirror) under the
  same tag, by `agent/scripts/mirror-config.sh`, which
  `.github/workflows/mirror-config.yml` runs as a job of the release-please run
  that created the tag (a tag made with GITHUB_TOKEN starts no workflow of its
  own, so a `push: tags` trigger never fires for it — OMP-30). So
  `omp-config-mirror@omp-home-v0.5.0` is a URL plus a tag. The mirror is intended
  to be public but is currently private pending re-publicisation (OMP-26), so the
  URL does not resolve for a reader yet.
- **Drift is stated, not hidden.** A session whose tree is ahead of the release it
  came from stamps `omp-config-mirror@omp-home-v0.5.0+3` (three commits past the
  tag) or `…+3-dirty` (and uncommitted changes). A tree with no reachable tag —
  `git describe --always` fell back to a bare sha — stamps
  `omp-config-mirror@untagged-<sha>`, so a bare sha never reads as a release. The
  trailer never implies the release contains work it does not. It is not an exact
  reproduction — a `-dirty` tree is not published at all, and the mirror carries no
  ledgers, audits or transcripts — so read it as "this release, plus drift", never
  as byte-for-byte provenance.
- **The exact commit is on the trailer, not only the release.** `commit=` is
  `git rev-parse --short=12 HEAD` in the harness checkout, so the identity resolves
  to a commit whatever branch or worktree the session ran from; `harness=` names
  the release that tree descends from, which is a different fact. A dirty tree
  appends `-dirty-<hash>`, the first 8 hex of the sha256 of `git diff HEAD`, so two
  dirty trees with the same changes carry the same identity and a different edit
  does not — untracked files are not part of it, matching `git describe --dirty`.
  One computation serves both surfaces: `agent/scripts/harness-identity.ts`, which
  the extension imports and `pb-land` runs directly to stamp the card it sets
  `Done` (`skill://backlog-conventions`).
- **Agent shells only.** The hook does nothing unless `OMPCODE` is set, so a human
  commit stays clean. A missing trailer means human, sync or unknown — never a
  guessed value.
- **A signal, not provenance.** It exists to show which identities produce work
  that holds up. Small drift is expected and accepted; do not add exactness
  machinery (drift detection, per-path dirty scoping, byte-exact versions) without
  a real question that needs it. `commit=` is that one addition, and it answers
  one: comparing outcomes across harness changes needs the commit a session ran
  from, not only the release its tree had drifted from (OMP-10).
- **The hook can never block a commit.** It always exits 0, and writes no trailer
  at all when it cannot build one.
- **Coverage is not total, and the gap is silent.** The hook fires only where
  `core.hooksPath` is the global directory; 18 of 169 repos under `~/repos` set
  their own, and every commit there degrades to *unknown*. `agent/scripts/install-git-hooks.sh
  --check` exits non-zero when the hook file or `core.hooksPath` is not current —
  run it after an `omp update`, and read commit attribution in a repo you did not
  configure with that in mind.
- **A PR can carry several identities** — an `omp update` or a harness change
  mid-branch means two. `agent/scripts/omp-identity-rollup.sh` lists the distinct
  values on a branch, and `pb-open-pr` puts the list in the PR body so the squash
  commit on `main` keeps them instead of one.

## Branching

- **Trunk-based**: branch from `main`, squash-merge back via PR.
- **Prefix = the kind of work**: `bugfix/`, `feature/`, `refactor/`, `spec/`,
  `design/`, `investigation/`, `migration/`, `chore/`, `docs/`,
  `continuous-improvement/`, `content/`, then a slug — `bugfix/null-cursor`. A
  tracker may require its issue ID in the slug; its skill says so. The guard's
  `branch-naming` check enforces this list.
- **The commit types are accepted prefixes too** — `feat/`, `fix/`, `perf/`,
  `test/`, `ci/`, `build/` — because more than 30 other repos document them in
  their own `AGENTS.md`/`CONTRIBUTING.md`, and a repo's convention outranks this
  skill. The standard is still the kind.
- **No `release/`, `hotfix/` or `spike/`.** A release is a tag on `main`
  (`## Releases`), a hotfix is an urgent `bugfix/`, and a spike is an
  `investigation/`.
- **Max lifetime**: 1–3 days. Max PR: ~400 lines.
- **No commits directly to `main`.** Always work on a branch.
- **No merge commits.** History is linear. Squash-merge only.

## PR titles

The PR title *is* the commit on `main` — squash-merge writes it there — and
release-please reads it to decide the version, so its type follows the kind of
work:

| kind | PR title type | version effect |
|---|---|---|
| `bugfix` | `fix` | patch |
| `feature` | `feat` | minor |
| `refactor` | `refactor` (or `perf`) | none (`perf`: patch) |
| `migration` | by effect: `feat`, `fix` or `refactor` | by type |
| `chore` | `chore`, `build` or `ci` | none |
| `docs`, `spec`, `design`, `investigation`, `content` | `docs` | none |
| `continuous-improvement` | the type of the change it lands | by type |
| any, breaking | `type!`, or a `BREAKING CHANGE:` footer | major (pre-1.0: minor) |

Commits *inside* the branch keep the standard types — the table under `## Commits`
is unchanged.

Re-check the title against the final diff before squash-merging: once merged it is
a release-notes line that nobody may edit by hand, and a scope that changed after
the PR opened ("five capability families" for work that landed seven) ships wrong.

## Releases

Every repo declares its profile in its `AGENTS.md`. Nothing else decides how it
versions.

- `Release profile: package` — **the default.** Anything published, installed or
  run by version: a library, a CLI, an omp extension, a desktop app, the `~/.omp`
  harness itself, and any new repo with no reason to choose otherwise.
  release-please owns the version.
- `Release profile: continuous — <reason>` — an opt-out, with the reason on the
  same line: a deployed app, a pipeline, a docs site, a content scope. Merge =
  ship: no tags, no versions, no release-please.
- **Precedence.** A repo whose own `AGENTS.md` states a versioning rule — "bump
  in the same PR", say — keeps it until it adopts release-please.

### release-please (package profile)

[release-please](https://github.com/googleapis/release-please) reads the
conventional commits on `main` and keeps a release PR, `chore(main): release
X.Y.Z`, open. Merging that PR bumps the version files, writes `CHANGELOG.md`, tags
the release and creates the GitHub Release. The config is read from the committed
files on the target branch through the GitHub API (`Manifest.fromManifest` →
`parseConfig(github, configFile, targetBranch)`), so each repo carries its own
copy. The templates below are the default; a repo overrides them by editing its own
copy and stating why next to its `Release profile` line.

Read upstream for the pinned version before choosing, not from memory:
the [README](https://github.com/googleapis/release-please#readme) (release-type
table), [customizing.md](https://github.com/googleapis/release-please/blob/main/docs/customizing.md)
(`extra-files`, `changelog-sections`),
[manifest-releaser.md](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)
(config keys, `bootstrap-sha`, `last-release-sha`, monorepos),
[schemas/config.json](https://github.com/googleapis/release-please/blob/main/schemas/config.json),
and the [action README](https://github.com/googleapis/release-please-action#readme)
(inputs, outputs).

| decision | standard | when to deviate |
|---|---|---|
| `release-type` | the strategy that owns the repo's version file: `node` (package.json), `python` (pyproject.toml), `rust` (Cargo.toml), `go`, `simple` (version.txt) when there is no manifest | no strategy fits: `simple` plus `extra-files` |
| other version locations | every file that states the version is in `extra-files` (`__version__`, a README badge, `app.json`), and so is any lockfile the strategy does not update — see below | — |
| first version | `initial-version: 0.1.0`, manifest seeded `0.0.0` | a repo with releases already: seed the manifest with the current version and set the top-level `bootstrap-sha` to that release's commit (used only until the first release PR merges). `last-release-sha` is read on every run: use it only to repair a wrong window, then remove it |
| pre-1.0 bumps | `bump-minor-pre-major: true` | — |
| release notes | `changelog-sections`: `feat`, `fix`, `perf`, `revert`, `docs`, `refactor` visible; `style`, `chore`, `test`, `build`, `ci` hidden | readers are end users only: hide `refactor`, and say why |
| tags | `vX.Y.Z` (`include-component-in-tag: false`) | a monorepo needs `<component>-vX.Y.Z`. **Never change the format after the first release**: release-please finds the last release by its tag. omp-home keeps `omp-home-vX.Y.Z` for that reason |
| layout | manifest mode, one package at `.` | monorepo: one entry per path |
| publish | a job in the same workflow, gated on `release_created` — a tag made with `GITHUB_TOKEN` does not trigger other workflows | nothing to publish: delete the job |

**Lockfiles.** The `node` strategy updates `package-lock.json` and
`npm-shrinkwrap.json`, and `rust` updates `Cargo.lock`
([node.ts](https://github.com/googleapis/release-please/blob/main/src/strategies/node.ts),
[rust.ts](https://github.com/googleapis/release-please/blob/main/src/strategies/rust.ts)).
The `python` strategy never touches `uv.lock`
([python.ts](https://github.com/googleapis/release-please/blob/main/src/strategies/python.ts)
updates `pyproject.toml`, `setup.cfg`, `setup.py`, `__init__.py`, `version.py` and
the changelog only), so a uv repo ships every tag with a lock one version behind
unless the package entry in `release-please-config.json` carries:

```json
"extra-files": [
  {
    "type": "toml",
    "path": "uv.lock",
    "jsonpath": "$.package[?(@.name.value=='<project-name>')].version"
  }
]
```

The filter must be `@.name.value`: release-please's TOML parser wraps each scalar,
so the bare `@.name` form matches nothing and modifies nothing, silently. A python
repo switches `release-type` to `python` and adds this entry; the template's default
stays `simple`. CI must run `uv lock --check` **before** any `uv run`, because
`uv run` rewrites a stale lock in place and the check then passes;
`uv sync --frozen` does not compare the lock against `pyproject.toml`.

Rules that hold in every package repo:

- A feature PR never bumps the version, and nobody edits a version, a released
  changelog entry or a tag by hand.
- Releases are tags on `main`; there are no release branches. When to cut one,
  and how to verify the tag, Release and artifact it makes: `pb-release`.
- A bot or sync that commits straight to `main` uses a type that does not bump
  (`chore(config): sync …`), or it shows up in the release notes.
- `CHANGELOG.md` means release notes and nothing else.
- Actions must be allowed to open the release PR. Keep the repo's existing
  default token permission while turning it on:
  ```bash
  R=repos/<owner>/<repo>/actions/permissions/workflow
  D=$(gh api $R -q .default_workflow_permissions)
  echo "{\"default_workflow_permissions\":\"$D\",\"can_approve_pull_request_reviews\":true}" \
    | gh api -X PUT $R --input -
  gh api $R   # read it back
  ```
  A release PR opened with `GITHUB_TOKEN` starts no workflows, so it **merges with
  no checks**: nothing validates the version bump or lockfile it makes. A PAT would
  make CI run on it; without one, the optional `validate-release-pr` job in the
  `release-please.yml` template runs the repo's CI against the release branch from
  `main`. It is advisory (it cannot be a required check on the release PR) and it is
  skipped when release-please pushes nothing to the branch.
- A wrong proposed version is fixed with `release-as` for one release, then
  removed.

## Repo files

Templates live at `skill://git-conventions/templates/`. Copy them; a placeholder
never survives the PR.

| file | template | when | notes |
|---|---|---|---|
| `CONTRIBUTING.md` | `CONTRIBUTING.md` | every repo | the human-facing summary of this skill; it defers to `AGENTS.md` for the release profile and tracking |
| `.github/workflows/pr-title.yml` | `pr-title.yml` | every GitHub repo | fails a PR whose title is not conventional. The local hook binds only agents; this binds the GitHub UI and everyone else. It runs on `pull_request`, so it checks the PR that adds it; a public repo taking fork PRs switches to `pull_request_target`. **Do not make it a required check**: release-please opens its release PR with `GITHUB_TOKEN`, which starts no workflows, so a required check would leave the release PR waiting forever |
| `CHANGELOG.md` | — | package | **do not create it.** release-please creates it on the first release (`createIfMissing: true` in every strategy). A file with content but no version entry gets a fresh `# Changelog`, then the entry, then the old content with every H1 demoted, so a header-only file ends up as a stray `## Changelog` at the bottom ([changelog.ts](https://github.com/googleapis/release-please/blob/main/src/updaters/changelog.ts) `adjustHeaders`) |
| `release-please-config.json` | `release-please-config.json` | package | set `release-type` and `extra-files` per the table above |
| `.release-please-manifest.json` | — | package | `{".": "0.0.0"}`, or the current version |
| the version file | — | package | the one the release type reads (`version.txt` for `simple`) at the manifest's version |
| `.github/workflows/release-please.yml` | `release-please.yml` | package | replace the `publish` job's placeholder step, or delete the job |

### GitHub merge settings

Squash-merge writes the commit on trunk from the repo's settings, not from the PR.
omp-home carried GitHub's defaults, `squash_merge_commit_title: COMMIT_OR_PR_TITLE`
and `squash_merge_commit_message: COMMIT_MESSAGES`, so a one-commit PR landed that
commit's subject as its title and the PR body — `Closes <ID>`, `## Verification`,
the identity list — never reached trunk. Measured 2026-10-18: the squash commits
for #87, #88 and #89 carry no body at all, though each PR had one. Set every
GitHub repo to the PR's own title and body, and read it back:

```bash
gh api -X PATCH repos/<owner>/<repo> \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
gh api repos/<owner>/<repo> --jq '{squash_merge_commit_title,squash_merge_commit_message}'
```

An explicit `gh pr merge --subject/--body` still overrides it for one merge.

## Starting a repo

`git commit` and `git push` are both blocked while HEAD is `main`, with no
override. Measured against a throwaway repo pair:

| attempt | result |
|---|---|
| first commit in a repo with **no commits** | **allowed**: a bootstrap allowance, read from the ref |
| the push that creates `main` on a remote that has neither `main` nor `master` | **allowed**: the other bootstrap allowance, read with `ls-remote` |
| any commit once `main` is live | blocked |
| `git push` while HEAD is `main`, once the remote has `main` | blocked |
| `git push origin <branch>:main` from a feature branch | blocked: the matcher reads the refspec |

So the way through is order, not an allowance:

- **Give the remote a `main` first.** `gh repo create <name> --private
  --add-readme --clone` makes the remote, its `main` and the local clone in one
  command, so a PR has a base.
- **Branch before the first commit.** For a local-only start, `git init -b main`
  then `git checkout -b chore/bootstrap` works on an unborn HEAD, and the commit is
  ordinary.

## Workflow

```bash
# Start work
git checkout main && git pull
git checkout -b feature/my-feature

# Commit (conventional format, always)
git add -A
git commit -m "feat(scope): what changed"

# Push branch
git push -u origin feature/my-feature
# Then open a PR and squash-merge it
```

## What NOT to do

- ❌ `git commit -m "fixed the bug"` — no type prefix
- ❌ `git commit -m "WIP"` — meaningless, use conventional format
- ❌ `git push origin main` — never push directly to main
- ❌ `git merge main` into a feature branch — rebase instead
- ❌ Merge commits in PRs — squash-merge only
- ❌ Bumping a version or tagging by hand in a package repo
