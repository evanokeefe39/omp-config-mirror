---
name: pb-open-pr
description: "Open ready PRs — one, independent, or a gh stack — each with a kind-specific body, rerunnable verification and its task links. Run at the end of other playbooks."
metadata:
  source: "pstack@157aae39 skills/poteto-mode/playbooks/opening-a-pr.md"
  license: "MIT — skill://operating-mode/LICENSE-pstack.txt"
---
## When

The end of any other playbook that changed files, and any request to open a PR.

Not: landing it once open (`pb-land`); getting an open PR green (`pb-babysit`).

## Outcome

Open, ready, non-draft PRs shaped as one PR, independent PRs or a native stack, each
with a body a reviewer can read instead of the diff: the sections its task's kind
needs, verification a reviewer can rerun, and links to its task, milestone and the
artifacts it answers.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- Every PR is open, ready and non-draft; a stack is one GitHub native stack whose every layer is reviewable on its own
- Every body links its task (and milestone when set) and carries `## Verification` as runnable commands with outcomes and links, or states what could not be run
- Reply: the PR URLs and, per PR, what it changes and how it was proven.
