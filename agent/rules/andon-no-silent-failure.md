---
description: Fail loudly, never silently. A silent failure behind a green build is the core defect — surface it with an explicit error, log, or andon; a step that "passed" without being exercised is a failure in disguise.
alwaysApply: true
---

# andon-no-silent-failure

Silent failure is the worst defect: it looks like success. Any operation that
did not actually run, produced nothing, skipped real content, or errored
swallowed must surface loudly.

- Never let a step report success (or stay green) when it skipped, dropped, or
  errored. If work was skipped or failed, say so and escalate.
- Instrument the boundary: a guarantee you cannot observe is not a guarantee.
- Fail the run or the check; never let a partial result masquerade as complete.
