---
description: A data source's intended state must be declared, never guessed. A deliberately-retired source is healthy; a live source gone quiet is not. If a source's intended state is unknown, escalate — never assume.
alwaysApply: true
agents: ["data-*"]

---

# dormant-vs-broken

A guardrail that fails on "source dropout or staleness" must distinguish an
**expectedly-dormant source** (deliberately retired) from a **broken source**
(a live source that silently stopped producing). A green build cannot tell the
difference, and neither can you by guessing.

- Before building a presence/freshness check, declare each source's intended
  state: **live** (must stay current) or **retired/dormant** (healthy as-is).
- A live source gone quiet is a defect — fail loudly. A deliberately-retired
  source is healthy — do not false-alarm on it.
- If a source's intended state is unknown, **ask** — never guess. Guessing
  either invents a regression (false andon) or hides a real one.
