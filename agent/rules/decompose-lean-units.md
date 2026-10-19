---
description: Size every delegated unit to a just-right target — small enough to fit the runtime cap and lean enough to avoid cache/re-read dependence, but not so fragmented that shared context is lost or dispatch overhead dominates.
---

# Decompose to lean, cap-safe units

Keep each delegated unit small enough to fit the runtime cap and lean enough to
avoid cache dependence, without fragmenting so far you lose the context a parent
already holds.

Size every unit against a just-right test:

- TOO BIG to delegate whole: spans multiple deliverables/contracts/domains, is
  expected to run >= ~30-45 min, or would hold a long materialization in-runtime.
  SPLIT it.
- TOO SMALL to delegate: a self-contained change you could edit inline in 1-2
  tool calls (one redundant line, one config fix, one symbol rename). DO IT
  INLINE; do not spawn a subagent.
- JUST RIGHT: one coherent deliverable with ONE observable acceptance
  criterion, <=5 explicit target files (no globs), carrying self-contained
  context (the why, the change, edge cases, acceptance) so the worker does not
  need to re-explore.

Rules of thumb:
- Decompose BY DELIVERABLE / contract boundary, not by phase, and never by
  hoping a big run finishes.
- HAND context, don't make the worker re-derive it — read-heavy exploration is
  what burns runtime and cache; pass what the orchestrator already knows.
- If two units would need sibling coordination or shared-file edits, they are
  ONE unit — never split a shared mutation boundary (single-writer DB,
  same-file edits).
- The parent holds shared context and cross-unit contracts; each unit carries
  only its slice.
- STOP when further splitting would split a single coherent contract or force
  the parent to re-explain shared state — that is the context-loss floor.
- Favor MORE, SMALLER parallel units over one big serial task — unless it
  over-fragments.
