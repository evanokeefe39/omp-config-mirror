---
description: Name the boundary of every deliverable — what it reads from, what reads it — and answer "is this verifiable without a fake on either side?". A deliverable whose acceptance mocks a boundary is a module, not a component. Guards the failure where every unit is complete in isolation and the integration belongs to nobody.
---

# The edge contract

A module is a unit of *code*. A component is independently *deployable and
verifiable* with its own contract. The gap between them is the boundary, and in
this harness the boundary has no other home: every primitive here — the tool
call, the task, the skill, the rule — is shaped as a property of a *node*.
Integration is a property of an *edge*.

That asymmetry is why a plan can pass all of its own criteria and still not run.
A plan whose every exit criterion is checkable without any other component
existing is the predictable output: nothing careless, and nothing wrong with any
single item. The shape of the work made per-node completeness easy and per-edge
completeness invisible.

## What to do

For every deliverable, state two things and answer one question.

Name what this deliverable **reads from**, and what **reads it**.
Then answer: **is this verifiable without a fake on either side?**

If the answer is no, the deliverable is a module. That is not a failure — it is
a fact that must be reported, because a module accepted as a component is how a
migration lands complete and non-functional.

## Why the question is the mechanism

A fake at the boundary is not merely incomplete coverage; it is *actively
misleading*. The mock encodes the author's belief about the other side's shape,
and it is the belief that gets tested. When the real envelope differs — nested
rather than flat, a field renamed, a key that arrives under a different name —
the suite stays green and the integration fails on first contact. The test was
never wrong about the thing it checked. It checked the wrong thing, confidently.

## What counts as evidence

- The acceptance names the counterparties explicitly: producer and consumer.
- It exercises the real path across that boundary, or states plainly that it does not.
- A mock at the boundary is a declared limitation, recorded as residual — never
  presented as coverage.

`migration-ships-with-code` and the boundary gate hook enforce the narrow,
mechanically-checkable slice of this: a test that patches a client, adapter,
session or endpoint is blocked unless it carries a declared suppression. That
hook is deliberately narrow. Everything else here is a judgement, and it is
yours to make and to state.
