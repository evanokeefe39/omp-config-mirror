---
name: pb-new-project
description: "Bootstrap a new repo, project, document set, channel or media library: backlog, repo, git files, release setup, ledgers."
---
## When

A new scope is being started: a repo, project, document set, content channel or
media library. This also covers a bare directory that nothing has been written down
for yet. This playbook is the process; the standards it applies are
`skill://git-conventions` (branches, commits, PR titles, releases, repo files),
`skill://backlog-conventions` (backlog, tasks, tracking), `skill://python-conventions`
(toolchain) and `skill://imp-setup` (ledgers).

Not: work inside a scope that already exists (`pb-feature`, `pb-bugfix`); seeding
the ledgers into an existing scope on its own (run `skill://imp-setup` directly);
adding release-please to an existing repo (a `chore` task applying
`skill://git-conventions` `## Releases`).

## Outcome

A scope whose first merged commit is one somebody else could have made. It has a
`backlog/` with its bootstrap task, a README that says why it exists, a LICENSE, an
AGENTS.md declaring its release profile and tracking, CONTRIBUTING.md and a PR-title
check, release-please when it is a package, the four ledgers from `skill://imp-setup`,
and a toolchain only if it has code. All of it lands through one squash-merged PR
linked to its task, never a commit on `main`.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- `scripts/check-bootstrap.py` passes against a fresh clone, not the working tree
- `git log --oneline` on `main` shows no merge commits
- The backlog is initialised, its prefix is under `## Tracking` in `AGENTS.md`, and the bootstrap task is Done in the merged PR
- The `pr-title` check ran green on the bootstrap PR
- For a package scope, release-please's first release PR proposes `0.1.0`
- The ledgers came from `skill://imp-setup`, not hand-written rows
- Reply: what the scope is, where it lives (repo URL, local path, backlog prefix), what the check reported, and anything skipped with its reason (for example no toolchain for a non-code scope, or `continuous` and why).
