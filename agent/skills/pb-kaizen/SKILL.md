---
name: pb-kaizen
description: "Run a retrospective, post-mortem or improvement pass over a named subject — a workflow, project, agent or incident: find its standard, measure where it is silent, propose countermeasures. Kaizen proposes; the human disposes. Not mid-task: an improvement idea raised while other work is open is deferred until that work closes."
---
## When

A retrospective, post-mortem or improvement pass over a named subject: a workflow,
a project, an agent, or an incident that already happened.

Not: recording one defect (`skill://imp-defect`); landing an accepted
countermeasure (`skill://imp-change`); establishing the four ledgers in a new scope
(`skill://imp-setup`).

## Outcome

Suggestions with evidence, written up as a retrospective page under the owning scope's `docs/retrospectives/` (`~/.omp/agent/docs/retrospectives/` for the harness), and no ledger row for anything the user did not accept.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- Every suggestion cites the measurement or ledger row behind it
- No ledger row exists for any countermeasure the user did not accept
- Reply: the subject, the standard found or absent, the measurements, the suggestions with what/why/how/goes-red, and which the user accepted. Kaizen proposes; the human disposes.
