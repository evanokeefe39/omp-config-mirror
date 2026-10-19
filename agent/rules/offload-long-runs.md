---
description: Runtime-cap survival — the subagent wall-clock timer runs continuously from spawn and is NOT paused on an in-progress yield. When a unit's remaining work (a long materialization, backfill, E2E, or the rest of a lifecycle) won't fit the budget, launch it as a background process, checkpoint, and TERMINATE your run so main can continue it in a fresh task. Never hold a long-running operation or wait inside your own session.
alwaysApply: true
---

# Offload long runs; terminate so main can continue

The subagent cap (`task.maxRuntimeMs`) is a HARD WALL-CLOCK timer armed when the
run spawns. It counts ALL elapsed time while the run is alive and is NOT paused
on a yield-in-progress — so you cannot "offload and wait", and you cannot
yield-in-progress expecting to be resumed later without your clock still
running to the abort.

1. If a run (pipeline, backfill, network/API materialization, full E2E,
   a batch re-run) will exceed your remaining budget, do NOT block on it
   in-runtime. Launch it as a background process (`hub` `start` for an
   indefinite/project process, or `bash` `async` for a finite run).
2. Checkpoint what is done vs pending plus the job reference, then TERMINATE
   your run (resolve) — return a status=in-progress report with the job ref.
   Do NOT yield-in-progress and wait to be resumed: that keeps your timer
   running and you will be aborted at the cap mid-lifecycle (and your child
   tasks die with you).
3. MAIN (not under the subagent cap) waits on the background job and, when it
   lands, dispatches a FRESH bounded subagent (new wall clock) for the next
   step — reconciliation, reviewer, backfill, PR. Do not re-spawn a whole fresh
   worker to redo completed work; resume from the checkpoint.
4. Main is the only surface not wall-clock capped, so long work flows UP to
   main and into background processes — never through a capped task, and never
   held open across a wait inside yourself.
5. Checkpoint incrementally (WRITE-FIRST, early commits) so an abort loses
   nothing and main can continue from a coherent state.
6. A service that runs indefinitely is a PROJECT-SCOPED process, not a task —
   `hub` `start` it (supervised), confirm readiness, then terminate/yield. Never
   try to finish or wait on an indefinite process inside a turn.
