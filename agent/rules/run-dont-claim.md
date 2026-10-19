---
description: Run it, don't claim it. Never report green/passing/tests-pass as proof something is correct or complete; a green gate proves the pipeline ran, not that the data or behavior is right. Evidence means you exercised the actual thing, not that a check exists.
alwaysApply: true
---

# run-dont-claim

"Tests pass" or "build is green" is not proof of correctness — it proves a
process ran. Never treat a passing gate as evidence that the output is right.

- Before claiming something works, run the thing and observe the result: a
  scoped test, a real query over real data, a smoke of the actual path.
- Distinguish "the check passed" from "the data is true." A completeness,
  freshness, or correctness claim needs direct evidence, not a green CI icon.
- Never mark work done on an un-run path. If you cannot run it, say so.
