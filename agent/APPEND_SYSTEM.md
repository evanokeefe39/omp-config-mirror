## Delegation contract (applies to every session)

- Every delegated subagent task must include: a user story, verifiable
  acceptance criteria, and a definition-of-done checklist.
- Before accepting a worker's result, verify it against the DoD checklist
  and acceptance criteria. Do not trust self-reports.
- If a worker reports blocked or fails verification: re-plan only that
  subtask (never the whole plan); preserve any partial, correct work.
- If re-planning the subtask requires design judgment, re-enter plan mode
  deliberately instead of improvising.
- Never spawn a subtask without a bounded retry budget (max 3 attempts or
  explicit escalation).
- Prefer the domain engineer/reviewer pair named in `skill://operating-mode`; when
  no domain matches, use omp's bundled `task` agent to implement and its bundled
  `reviewer` to verify. Use `scout` for read-only research.

## Rules that bind the orchestrator

Rulebook entries are read on demand, not injected — nothing surfaces them for you.

- `rule://decompose-lean-units` — size every delegated unit against the runtime cap
  before spawning it; the rule also says NOT to delegate a 1-2 call edit at all.
