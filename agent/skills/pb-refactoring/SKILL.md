---
name: pb-refactoring
description: "Change structure without changing behaviour — rename, extract, inline, dedupe, move — with the contract pinned before and proven after."
metadata:
  source: "pstack@157aae39 skills/poteto-mode/playbooks/refactoring.md"
  license: "MIT — skill://operating-mode/LICENSE-pstack.txt"
---
## When

A structure change with behaviour held constant: rename, extract, inline, dedupe,
move, collapse a layer. Also a **replacement across a codebase boundary** — a
port or rewrite onto a new stack, when the incumbent question in
`skill://playbook-or-skill` names an incumbent outside this repo: the kind is
still this playbook's — behaviour held constant; only the binding differs.

Not: new behaviour (`pb-feature`); a defect (`pb-bugfix`). Large or cross-cutting
structural work is a series of this playbook plus `pb-feature`, not one run.

## Outcome

The structure changed, the behaviour byte-identical — in this repo; across a
codebase boundary, at parity with the incumbent's observable behaviour — the pin
held throughout, and the reader load lower somewhere.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- The pin went red on a real behaviour change and green again after, with the run recorded
- Every caller migrated and the old API deleted, with no shim or dual path left
- When the incumbent is read-only and outside this repo (a port), the previous
  bullet reads: every incumbent mechanism accounted for — ported,
  replaced-with-parity, or deliberately dropped in the spec

- Reply: the structure that changed, the pin you held it against — this repo's
  tests, or the incumbent's observable behaviour captured before the change —
  the equivalence proof, the reader-load delta, what shipped and what got
  reverted. No new behaviour.
