---
description: Define the negative space of every change. Never rewrite raw/observed history; never make un-delegated architecture decisions; never fabricate output, claims, or data. State what must NOT change and what is out of scope before implementing.
alwaysApply: true
---

# negative-space

Every change has a boundary. Define what must not change, what is out of
scope, and which decisions are reserved for the human — before implementing.

- Never rewrite raw/observed history (bronze/raw = as-observed; a source's
  original log is immutable).
- Never make an architectural decision that was not specified or delegated;
  surface it instead.
- Never fabricate output, data, research findings, or claims. Unverified
  statements are marked [INFERENCE], not asserted.
- Scope creep is a defect: implement what the brief asks, nothing more.
