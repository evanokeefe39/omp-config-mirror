---
description: "Apply when you write, change, or keep a test. Call the code the way its users do and assert the result they observe against a literal expected value. If the test would still pass when every imported function returns undefined, rewrite the assertion or delete the test."
agents: ["*-engineer"]
---

# Test Behavior, Not Implementation

A test calls the code the way its users do and asserts the result they observe against a literal expected value. A test that asserts which calls the code made, or restates a constant the code contains, does neither.

The check: before you keep a test, ask whether it would still pass if every function it imports returned `undefined`. If yes, it observes no behavior and cannot fail for a defect. Rewrite the assertion or delete the test.

**Why:** A test that cannot fail for a defect costs CI time and review attention and catches nothing. A constant pin also fails when someone edits the constant or the prompt it restates, so it prevents that edit.

**Five shapes that still pass when every imported function returns `undefined`:**

- **Weak or no assertion.** No `expect`, or only `toBeDefined`, `toBeTruthy`, `not.toThrow`, `toBeInstanceOf`, `toBeGreaterThan(0)`.
- **Mock or absence only.** Only `toHaveBeenCalled`, `not.toHaveBeenCalled`, `toBeUndefined`, `toEqual([])`, `toHaveLength(0)`, `not.toBe(wrongValue)`.
- **Self-referential.** The expected value comes from the code under test: `expect(f(a)).toBe(f(a))`, `expect(parsed.url).toBe(buildUrl(...))`.
- **Constant pin.** The assertion restates a hand-maintained constant, config default, table row, or prompt string: `expect(LIMITS.maxTools).toBe(8)`, `expect(PROMPT).toContain("You are")`.
- **Fixture asserts fixture.** The assertion reads data the test built or a value computed in `beforeEach`, and the subject never runs inside the body.

**The fix:** call the subject inside the test body with one concrete input and assert the literal output or the observable effect, `expect(slugify("Hello, World!")).toBe("hello-world")`. For an absence, assert the presence on the other input in the same test. For a constant, test the mechanism that reads it with one input instead of restating the value. For a mock, assert the payload it received or the state after the call, not that it was called. When no such assertion exists, delete the test.

**Keep** a test of a relation across a table's rows (a key present in two tables, a parent that exists), and a compile-time check in a `*.test-d.ts` file.

## A claimed red-before test must be observed failing

When a fix ships with a test that is supposed to prove it, the static check above is
not enough: **revert the fix, run the test, and watch it go red.** A test written
against the fixed code encodes whatever the fix does, including a mistake in the fix.

Measured on an extension repo, 2026-10-04. A `phases_matched` regression test
was written to prove that an equal-count todo replacement is recorded; it passed. It
also passed with the fix reverted, because the test's own fixture made the arm unreachable
either way — the guard it was meant to exercise never ran. Reverting the fix by hand was
the only thing that exposed it; the test as written would have shipped as false
assurance. A second defect followed from the same cause: the test's initial form asserted
the *buggy* moment (the record was compared against the previous todo), so the suite
blessed the mis-timing and could not fail for it.

The practice: for each test that claims to prove a fix, `git stash` the fix (or revert
the hunk), run the test, and confirm the red. If it passes without the fix, the test
proves nothing — rewrite it until it fails, then restore the fix. State the observed red
in the PR body; an unobserved red is a claim, not a proof.

This is the same lesson as the check above, applied to time rather than to shape: a test
that cannot fail for a defect is worthless, and the only way to know a *new* test can
fail is to have seen it fail.


Source: pstack@157aae39 skills/principle-test-behavior-not-implementation (MIT — skill://operating-mode/LICENSE-pstack.txt).
