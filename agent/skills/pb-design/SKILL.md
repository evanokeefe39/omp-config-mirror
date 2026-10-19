---
name: pb-design
description: "Turn an approved spec into a design: research what exists, size the risk, decide on spikes, diverge 2-3 whole-shape candidates, screen red flags, review to derisk, record design.md."
metadata:
  source: "pstack@157aae39 architect/arena/principle-exhaust-the-design-space (MIT, licence at skill://operating-mode/LICENSE-pstack.txt)"
  license: "MIT — skill://operating-mode/LICENSE-pstack.txt"
---
## When

An approved spec exists and a how must be chosen: candidates, risks and the decision recorded in `design.md`.

Not: writing the spec (`pb-spec`); implementing the chosen design (`pb-feature`, `run pb-bugfix`); an open question answered by reading the system (`pb-investigation`).

## Outcome

A `design.md` naming the chosen shape, the losing alternatives and why they lost, with risks derisked by review or spike before implementation.

## Depth paths

Pick the minimum path for the change class (proportional gates; see
`research-scope/findings/spec-driven-design-2026-deep-research.md`, "Proportional gates"):

| Change class | Minimum path | Additional gates |
|---|---|---|
| Trivial/reversible | Clear intent → direct implementation → automated check | Code review if normal team policy requires it |
| Local feature or bug | Acceptance criteria → short plan/tasks → tests and implementation | Brief design only if interfaces/data/operations change |
| Cross-component feature | Behavioral spec → design/RFC → tasks → staged implementation | ADRs, C4 views, contract tests, migration/rollback |
| High-risk or regulated | Requirements and quality scenarios → spikes/threat analysis → reviewed design → tasks | ATAM or equivalent, traceability, independent verification, audit evidence |
| Data product | Use-case and consumer spec → data contract and quality SLOs → data design → tasks | Ownership, lineage, compatibility, privacy, cost and operations reviews |
| UX-intensive | Discovery/Define evidence → interaction/accessibility spec → prototype and tests → technical design | Design-system conformance and usability validation |
| Replacement/port | Incumbent differential inventory → parity pin defined before implementation → differential verification | Incumbent and dispositions from the spec's Incumbent section; hand off with `run pb-refactoring` |

A trivial or local change records `design skipped: <path>` so the router signals can count skips.

## Red flags

Screen every candidate; reject or revise a shape that trips one:

- **Shallow module** — a large interface hiding little complexity.
- **Information leakage** — one internal decision appears in more than one module, so changing it needs coordinated edits.
- **Temporal decomposition** — modules organised by execution order instead of the knowledge they own.
- **Pass-through method** — a method that forwards arguments unchanged, adding a layer without hiding complexity.
- **Capability loss** — a demonstrated incumbent mechanism (the spec's Incumbent
  section) has no home in any candidate. That forces a revision, or an evidenced
  drop decision — a measured reason recorded with the candidate, not a miss.

## design.md sections

- **Context** — the problem and the constraints the design must honour.
- **Alternatives considered** — required; names the losing shape and why it lost.
- **Decisions** — the load-bearing choices and their reasons.
- **Risks** — named risks, sensitivity points and tradeoffs.
- **Migration and rollback** — how the change lands and retreats.
- **Tasks** — dependency-ordered, session-sized, each with a verification signal.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- `design.md` exists with all six sections, including the losing alternative and why it lost
- The candidates were screened against the red flags, and the review named the risks and tradeoffs
- Reply: the chosen shape and why, the alternatives rejected, the depth path taken, and risks still open
