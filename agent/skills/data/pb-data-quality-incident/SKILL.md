---
name: pb-data-quality-incident
description: "Handle ONE data-quality incident - prove the blast radius from real rows (landed-nothing guard), write the root cause before the fix, fix exactly that one incident, re-test the failure closed, record the incident."
---
## When

A known data-quality failure, one incident per run.

Not: onboarding a new source (`pb-data-source-onboarding`); a schema or DDL
change on an existing store (`pb-data-schema-migration`); a code defect with no
data dimension (`pb-bugfix`).

Use for a known data-quality failure; not for routine pipeline changes, and never
for multiple incidents in one dispatch, which are separate runs.

## Outcome

The blast radius proven from real rows, the root cause written before the fix, the
incident fixed and its failure re-tested closed, and the incident recorded.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- The blast radius is measured from real rows, and an incident with zero affected rows was closed at the landed-nothing guard
- The root cause was written before the fix and every changed line maps to it
- The original failing case now passes, and the guard that would have caught it was made to fire
- Reply: what landed and where, the root cause, the fix, the re-test result, and the guard that now fires.
