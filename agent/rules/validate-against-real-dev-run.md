---
description: Validate against a real developer-run, not prose. Evidence in a PR must come from running the actual thing over real data — a real query, a real load, a real check — never a hand-written claim or a test-fixture pass.
alwaysApply: true
agents: ["data-*"]

---

# validate-against-real-dev-run

A claim that "it works" is only credible when it was exercised over real data
in a real run — the failure mode manual review finds is the one no fixture or
prose check catches.

- In the PR/return, give evidence from a real dev-run: a query over real data,
  a real (possibly subset) materialization, an actual guardrail firing.
- Fixtures prove plumbing, not production behavior. Real rows prove the data
  path. Use both, and say which evidence is which.
- When a change touches real content (paths, quoting, control bytes), run it
  against that real content — that is what the fake-data path never catches.
