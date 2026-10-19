---
name: pb-spec
description: "Write a behavioural spec (what and why): frame, specify through doc-writer, clarify every open question with the user, lint, review."
metadata:
  source: "adapted from GitHub Spec Kit spec-template.md and clarify (MIT), OpenSpec requirement/scenario format (MIT), EARS phrasing"
  license: "MIT — see each upstream repository; EARS per alistairmavin.com/ears"
---
## When

A change needs testable behaviour agreed before design: what the system shall do, for whom, and why.

Not: choosing how to build it (`pb-design`); a defect with a known repro (`pb-bugfix`).

## Outcome

An approved behavioural spec with every contract testable, no open questions left, and no technology choices in it.

## Spec format

The spec has these sections:

- **Intent** — the problem, users and outcome.
- **Incumbent** — when a working implementation of this behaviour already exists
  (the incumbent question in `skill://playbook-or-skill` named it): every
  demonstrated predecessor mechanism, each with a disposition of `preserved`,
  `replaced-with-parity`, or `deliberately dropped: <reason>`. Walk the
  categories mechanically, not from memory: client/session construction and
  impersonation target; special-status handling (202/429/5xx) and the
  retry/backoff policy; headers; pacing/concurrency; egress/proxy routing and
  cost gating; and any measured hazard notes in the predecessor's own comments.
  With no incumbent, state `none` affirmatively and where the question was
  answered.
- **Behavioral Contracts** — GIVEN/WHEN/THEN, or EARS `WHEN … THE SYSTEM SHALL` for system rules.
- **Edge Case Inventory** — the failure path of every contract.
- **Negative Space** — what the system must not do, what is out of scope, and —
  with an incumbent — what the incumbent did that the new system must not
  silently lose.
- **Open Questions** — unresolved, phrased as questions.
- **Quality Scenarios** (optional) — latency, freshness, cost, where they matter.

Mark unknowns `[NEEDS CLARIFICATION]` inline instead of guessing (the Spec Kit convention). Clarify them against the taxonomy: scope, data, non-functional, edge cases, terminology. A spec with open questions does not go to design.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- The spec has every required section, no leftover `[NEEDS CLARIFICATION]`, and the lint passes
- The doc-reviewer confirms every contract is testable, no "how" leaked in, edge
  cases cover each contract's failure path, and every demonstrated incumbent
  mechanism carries a disposition (or the section states `none` affirmatively)
- Reply: the spec path, the questions the user resolved, and anything still open
