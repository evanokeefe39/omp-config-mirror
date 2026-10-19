---
name: pb-feature
description: "Add or change behaviour, starting from a named data shape: orient, design, build through a delegate, verify on the real surface, land."
metadata:
  source: "pstack@157aae39 skills/poteto-mode/playbooks/feature.md"
  license: "MIT — skill://operating-mode/LICENSE-pstack.txt"
---
## When

Use when adding a new behaviour to the system, or a change to the existing behaviour of a system. Behaviours of the system should be found in the system spec (i.e a SPEC.md or specification in the /docs folder depending on project). If a spec doesn't exist you must warn the user and request pb-spec playbook be used. 

Not:
- a defect (`pb-bugfix`); 
- a structure change with behaviour held constant (`pb-refactoring`).

## Outcome

The behaviour exists on the real surface, built from a named data shape and acceptence criteria with the
design decision recorded rather than folded silently into the implementation. 

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- The behaviour is observable on the matching surface.
- The behavious is executed at runtime in the 'real' environment. A test harness or liners / CI goes green does not mean done.
- Measurable improvement on existing feature if there is one.

Reply:
- what you built, what you chose and why, the throughput checkpoint, open decisions. Tables for design alternatives.
- apply /unslop to response
