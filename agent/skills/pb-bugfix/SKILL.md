---
name: pb-bugfix
description: "Fix a reported defect: reproduce it on the real surface, root-cause it with runtime evidence, fix only what the evidence justifies, prove the repro now passes."
metadata:
  source: "pstack@157aae39 skills/poteto-mode/playbooks/bug-fix.md"
  license: "MIT — skill://operating-mode/LICENSE-pstack.txt"
---
## When

A reported defect, or a behaviour that is wrong rather than missing.

Not: new behaviour (`pb-feature`); a structure change with behaviour held constant
(`pb-refactoring`).

## Outcome

The smallest change the evidence justifies, with the failing repro landed before
the fix, and the repro shown passing afterwards. Every shipped line traces to
runtime evidence.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- The failing repro landed before the fix, and both are in the history
- The original repro now passes, shown verbatim
- Reply: what was broken, the root cause, the fix, how you verified. Paste the failing-then-passing repro output verbatim.
