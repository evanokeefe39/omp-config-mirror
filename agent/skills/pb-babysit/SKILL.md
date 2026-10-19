---
name: pb-babysit
description: "Drive an open PR or stack to merge-ready — conflicts, review threads, CI — and stop at the line a human must cross. Any 'check on PR N' request. Only on an explicit request to drive an existing PR or stack; never as part of authoring or opening a PR."
metadata:
  source: "pstack@157aae39 skills/poteto-mode/playbooks/babysit.md"
  license: "MIT — skill://operating-mode/LICENSE-pstack.txt"
---
## When

A request to get an open PR or stack merge-ready, to "check on PR N", to answer its
review comments, or to babysit it. Babysitting starts when the user asks, normally
once a phase or a whole stack is built.

Not: landing the stack (`pb-land`), which begins where this ends.

## Outcome

The merge frontier is merge-ready: conflicts reported, review threads answered,
CI green, and nothing merged that the human did not explicitly ask to merge.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- The declared mode was honoured, and `drive` ended at merge-ready rather than at a merge
- Every review comment is fixed, dismissed with a reason, or asked about
- Nothing merged unless the user explicitly asked
- Reply: the mode, the frontier and its state, what you fixed versus dismissed with reasons, what is still pending, and what needs the human.
