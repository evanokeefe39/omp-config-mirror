# Contributing

How changes reach `main` in this repo. The release profile and where work is
tracked are declared in `AGENTS.md`.

## Branches

Branch from `main`, named `<kind>/<slug>` — for example `feature/csv-export` or
`bugfix/null-cursor`. The kind is one of `bugfix`, `feature`, `refactor`, `spec`,
`design`, `investigation`, `migration`, `chore`, `docs`, `continuous-improvement`,
`content`. Keep a branch to 1–3 days and a PR to about 400 lines.

Never commit or push to `main`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`,
in the imperative. Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`, `style`.

## Pull requests

PRs are squash-merged, so the **PR title becomes the one commit on `main`**. It
must be conventional (a check enforces it), and its type sets the next version:

| title type | version |
|---|---|
| `feat` | minor |
| `fix`, `perf` | patch |
| `feat!`, `fix!`, or a `BREAKING CHANGE:` footer | major (minor before 1.0) |
| anything else | none |

Absorb upstream changes with `git rebase main`, never a merge commit.

## Releases

If `AGENTS.md` says `Release profile: package`, [release-please](https://github.com/googleapis/release-please)
owns the version. It keeps a release PR (`chore(main): release X.Y.Z`) open; merging
it bumps the version, writes `CHANGELOG.md` and tags `vX.Y.Z`. Never edit a version,
the changelog's released entries, or a tag by hand.

If it says `Release profile: continuous`, a merge to `main` ships and there are no
versions.
