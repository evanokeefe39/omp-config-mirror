---
name: pb-land
description: "Land a green PR or stack into trunk: independently verify each PR, then squash-merge the contiguous verified run with gh stack."
metadata:
  source: "pstack@157aae39 skills/poteto-mode/playbooks/shipping.md"
  license: "MIT — skill://operating-mode/LICENSE-pstack.txt"
---
## When

A request to merge, land or merge-when-ready an open PR or stack of PRs.

Not: getting a stack green (`pb-babysit`, which runs first); opening it (`pb-open-pr`);
cutting a release (`pb-release`). Landing puts commits on trunk; it does not release.

## Outcome

A contiguous verified run of PRs squash-merged into trunk, one commit per PR, with
each verdict tied to the patch it judged, and the next unverified gap named.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- Only PRs with a current `PASS`/`PASS+NOTES` verdict, or a recorded self-verified exception, were merged, each with `--squash`
- Every merged PR's patch-id was re-checked after its final push
- No merge ran while a check on the PR, or on any PR the stack would land, was failing or pending — the command guard refuses one, and refuses a merge whose check state it cannot read at all
- Every task the run closed is `Done` on trunk, and nothing the run merged is left `For Review`
- Reply: the verified run and its ceiling, each PR's verdict and who produced it (or the self-verified reason), the merge command used, what landed on trunk, what the next gap needs, and any milestone the run completed with the offered `run pb-release`.
