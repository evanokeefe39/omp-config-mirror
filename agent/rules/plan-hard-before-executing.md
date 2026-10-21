---
description: Plan the WHAT and WHY before the HOW. Iterating on the plan up front is far better value than steering through execution of a bad plan. When planning execution, plan for the machine you are — parallelize independent units (for correctness, not just speed) with a deliberate concurrency bound, use git worktrees AND plan the merge, and launch long-running/heavy work through hub or async rather than inline where a short timeout kills it. Review is a dedicated reviewer subagent at a named boundary in the plan, never a per-turn advisor; the advisor stays off in both the global flag and the per-agent record.
alwaysApply: true
---

# plan-hard-before-executing

**Plan depth up front beats navigating execution of a bad plan.** Iterating on the plan
is the highest-value use of tokens in a task; execution is where a bad plan becomes
expensive. An advisor cannot rescue a plan that was never sound — it only produces
per-turn noise while you steer around the consequences of a weak premise.

Two distinct questions, both required, neither a substitute for the other:

1. **WHAT to work on and WHY** — the outcome, the scope, what is explicitly out of scope,
   what must not change, and which decisions are reserved for the human. A plan that
   answers only "how" will execute something nobody asked for.
2. **HOW it executes** — the mechanical shape. See the execution-planning checklist below.

A plan is not ready to execute until both are answered. If the WHAT is thin, do not
compensate by planning the HOW in more detail — go back and settle the WHAT.

## Execution-planning checklist

When writing the HOW, plan for the machine you actually are — not for a human working
serially by hand.

**Parallelism.**
- You generate code files near-instantly and in parallel. Plan a decomposition into
  independent units rather than a sequential list of edits.
- Parallelize for **correctness**, not only speed: independent units avoid the race
  conditions and partial-ordering bugs that sequential improvisation creates.
- **Bound the fan-out.** Unbounded parallelism (heavy builds, DB loads, model calls,
  test suites) will saturate CPU/disk/network and make everything slower. Cap concurrency
  deliberately, and sequence the genuinely heavy stages.
- Identify what is *truly* independent. Two units that write the same file are not
  parallel units.

**Isolation.**
- Use **git worktrees** for concurrent units so parallel work cannot collide in one
  working tree.
- Plan the **merge** explicitly: worktree isolation is worthless if isolated work never
  lands. Name who integrates, on which branch, and at which point — as a plan step, not
  an afterthought.

**Long-running and heavy work.**
- Some work runs for hours (data pipelines, backfills, full builds, large loads). That
  work MUST be launched through `hub` (or an async/background launch), **never** run
  directly in the agent turn — an in-turn run hits a short timeout and dies mid-flight,
  losing the work and the evidence.
- Before launching any long run, checkpoint what is done vs pending, and write the job
  reference down so the run is resumable.
- State the expected runtime and cost at launch for anything long or expensive.

**Timeouts and blocking.**
- Never hold a bounded unit open waiting on something long. Offload, record the job
  reference, terminate, and let an uncapped surface (main) await the result.

## The advisor's role

The advisor is a **gentle guard rail for subagents during execution** — it exists so the
human has to steer less while a plan they already approved is being carried out. It is
**not** a driver of change, and it is **not** a substitute for planning.

- It MUST NOT be the mechanism by which a task's direction gets decided.
- Do not lean on it to discover that the plan was wrong — that discovery belongs in
  planning, before execution starts.
- If execution repeatedly needs steering, the plan was under-specified. Fix the plan;
  do not add review pressure to the execution.

**Policy: the advisor stays OFF, and review is a subagent step.** Review happens in the
plan, at a named boundary, performed by a dedicated reviewer subagent — `reviewer`,
`dlc-reviewer`, `security-reviewer`, or the domain reviewer for the artifact
(`app-backend-`, `data-`, `ux-`, `iac-`, `harness-`, `doc-reviewer`). A reviewer costs
tokens once and reports what it checked against; a per-turn critic bills on every tool
round and cannot be held to a checklist.

- `/advisor on` is not the review mechanism for any session. Reaching for it because a
  plan has no reviewer step is the anti-pattern below, not a fix.
- The global config carries this in **two** places, and the second is the one that
  bites: `advisor.enabled: false` **and** `task.agentAdvisor.task: "off"`. A legacy
  `advisor.subagents: true` migrates into the per-agent record, which advises every
  subagent spawned by the bundled `task` agent regardless of the global flag. Measured
  2026-10-21: 32% of the day's requests were advisor calls while `advisor.enabled` read
  false. Check both before concluding the advisor is off.

The dividing line is **"does the plan name its reviewers?"** — not "is the work risky?"

## Anti-patterns this rule rejects

- Treating review/advisor feedback as a way to find the design as you go.
- Leaving the advisor on for work whose plan was already settled.
- A plan that specifies only HOW, with the WHAT and WHY left implicit.
- A plan with no reviewer step, then relying on the advisor to catch what review would have.
- Sequential execution plans for work that decomposes into independent units.
- Parallel execution with no stated concurrency bound or integration step.
- Running hour-long pipelines inline in an agent turn and hitting the timeout.
- Isolated worktree work that nobody planned to merge.
