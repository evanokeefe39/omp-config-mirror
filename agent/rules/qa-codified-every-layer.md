---
description: Codify QA at every layer of the data flow — checks on every materialized asset, a test per behavioral contract and edge case. "Tests pass" is not completeness; per-layer guards prove each layer's contract, not just the build.
alwaysApply: true
agents: ["data-*"]

---

# qa-codified-every-layer

Quality is enforced layer by layer, not once at the end. Every materialized
asset carries checks; every behavioral contract and edge case has a test.

- Asset checks on every asset (presence, freshness, schema, invariants).
- A load or transformation has a test that would fail on a plausible bug —
  test behavior, boundaries, invariants, real errors; not plumbing.
- "Tests pass" is not completeness: the guard must prove the layer's actual
  contract (dropout, staleness, schema drift), not just that code ran.
- A producer with no guardrail is how a source silently empties behind green.

## A matcher is not a guard until you have watched it fire

Three ways a matcher looks correct and measures nothing. All three happened in
one session:

- **`\b` after a non-word character never matches.** `patch(`, `jest.mock(` and
  `vi.mock(` end in `(`, so a pattern written to catch mocking constructs
  matched none of them and the gate it drove was green and inert.
- **`_` is a word character.** `\bhttp\b` does not match `http_client`, and
  `\bclient\b` fails because `_` precedes it — every snake_case identifier is
  invisible to a word-boundary pattern. Use `(?<![A-Za-z0-9])` /
  `(?![A-Za-z0-9])` when `_` should separate.
- **A substring match over a transcript is not a count of records.** Grepping
  session logs for a record type returns prose that *mentions* the type. Parse
  the structured entries to count them.

So a matcher ships with a fixture that proves it fires on its target AND a
near-miss it rejects. "It matches" is not evidence until you have also watched
it *not* match. This is the vacuity rule one level down: the check that cannot
fail is not a check, and the matcher that cannot miss is not a matcher.

## A green fixture proves the code, not the deployment

Fixtures import the guard's source directly. The running agent loads hooks once
and does not re-read them. So after a guard is fixed, the fixture goes green
while the live session keeps enforcing the previous version. Measured, not
theorised: a fixed guard let the offending command through in the main session
and in a freshly dispatched subagent, while the fixture passed and a separate
fresh process blocked it.

- A guard edit is not live until the session restarts. Verify in a new process;
  a passing fixture is not deployment evidence.
- A guard silently running yesterday's code is worse than a gap, because a gap
  has at least been noticed.
- Gate the fixtures on commit, so a dead or stale matcher cannot be published
  by a suite that nobody ran.
