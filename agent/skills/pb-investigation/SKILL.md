---
name: pb-investigation
description: "Answer a read-only question with a written, cited deliverable: how does X work, why was Y built this way, are we sure, X or Y. Produces an explanation or a recommendation, never a code change."
metadata:
  source: "pstack@157aae39 skills/poteto-mode/playbooks/investigation.md"
  license: "MIT — skill://operating-mode/LICENSE-pstack.txt"
---
## When

A read-only question that ends in a written answer: how does X work, why was Y
built this way, are we sure, or a decision between alternatives.

The routing rule treats exploration as needing no route, so this runs when the
user invokes it (`/skill:pb-investigation`) or when the deliverable is a written
artifact.

Not: a question you can answer with one search; a change you already know how to
make (that is `pb-feature` or `pb-bugfix`).

## Outcome

A cited explanation or a recommendation, in the `how` output shape or as a
tradeoffs table. Nothing in the repo changes.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- The answer is cited: file paths, symbols and line numbers, not assertion
- Nothing in the repo changed
- Reply: the investigation output. For "are we sure?" answers, the real judgment with reasons.
