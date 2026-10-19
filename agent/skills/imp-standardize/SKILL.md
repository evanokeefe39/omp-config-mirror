---
name: imp-standardize
description: >
  Turn a process you have actually done into standard work — the human-followable
  procedure, plus whatever holds it in place (a rule, a hook, a script, a doc, a
  TTSR rule). The single verb for standardising work. Use when a process has
  repeated and is still improvised, or when an imp-kaizen pass found no standard
  for its subject.
---

# imp-standardize — write the standard, then install it

Standard work is the baseline every improvement is measured against — *without
standard work there is no kaizen*. This is the operation that creates it, and the
**only** verb for doing so.

**Do not standardise what you have not done.** Toyota's sequence is unforgiving:
do the work by hand, improve it, then make it repeatable by anyone. A procedure
written from intent is a guess with a filename, and it will be wrong in exactly
the places that matter — the ones the doing teaches you.

## Run it when

- a process has been executed repeatedly and is still improvised each time
- two sessions did the same job differently and both were plausible
- an `imp-kaizen` pass found **no standard** for its subject — reporting the
  absence is not the end of the job
- a standard exists but keeps being skipped, because nothing holds it in place

## You need first

**Dated instances of the process actually happening** — git history, ledger rows,
plans, transcripts, reports.

**The bar: dated evidence in ≥2 repos with ≥3 instances, or ≥5 instances in one
repo.** Below it this is a task, not a standard: say so, and offer a backlog row
in `WORKFLOWS.md` instead. Never standardise on intent alone.

## Steps

1. **Write the process you actually did**, not the one you wish you had done.
   Cite the instances near the top, so a reader can check you.
2. **Cap it at five steps, each producing a named artifact.** Reliable
   instruction-following breaks past five or six simultaneous constraints; a step
   with nothing to show for it is a wish, not a step.
3. **One verification step, and name the exit condition.** Excessive verification
   is the single largest measured cause of regression — a ten-item checklist
   makes the work worse, not safer.
4. **Consume before you write.** Find what already owns this concern — a rule, a
   hook, a skill, a doc, a script — and extend it rather than adding a parallel
   mechanism. Two mechanisms for one concern is the defect this operation exists
   to prevent.
5. **Install it.** Ship the procedure as a skill, add only the enforcement the
   standard has earned (table below), and index it in `WORKFLOWS.md` with its
   scope and evidence.

## What a standard may need

The procedure is always a skill. Everything else is optional, and earns its place
only by doing something the skill cannot:

| artifact | lives in | add it when |
|---|---|---|
| **skill** | `skills/<name>/SKILL.md` | always — the human-followable procedure |
| **rule** | `rules/<name>.md` | it must shape behaviour *before* work begins |
| **hook** | `hooks/pre/*.ts` | a violation is mechanically catchable at the moment it happens |
| **script** | `scripts/` | the check is worth re-running on demand — pair it with a `VERIFY.md` row |
| **doc** | `docs/` | durable rationale a reader will need later |
| **TTSR rule** | `agents: [main]` + a `condition` regex | the agent must be *nudged* mid-run rather than blocked. It matches prose and tool text, so it fires on mentions, not on state — never use it where a hook would do |
| **extension** | `extensions/*.ts` | the standard needs to observe or inject a session event no other mechanism exposes |
| **workflow subagent** | `agents/<name>/` | **deferred** — see `WORKFLOWS.md` |

Two binding rules, both from the layer table in `AGENTS.md`:

- **Prefer informing over blocking.** Layers 1–2 are the highest-leverage gap — a
  rule that shapes the first attempt beats a gate that rejects the third.
- **Every check ships with a case proving it can go red**, and nothing you add is
  finished until its row exists — that half is `imp-verify`.

## Done when

Someone else could follow it without asking you a question: ≤5 steps, one
verification, a named exit condition, real instances cited, `skill://<name>`
resolves, and every mechanism you added has a `VERIFY.md` row with a real
`goes red`.

**A standard with a skill but no enforcement is a wish. A standard with
enforcement but no skill is a trap nobody can follow.** You are aiming between
those two.

## Where it lands

`skills/<name>/SKILL.md`, plus whatever the table earned, indexed in
`WORKFLOWS.md`. **Yokoten:** a standard that applies beyond the project it was
written in belongs in the global harness (`~/.omp/agent/`), not in the repo — an
improvement confined to where it was found is incomplete work.

Establishing a scope is `skill://imp-setup`; each ledger's row format belongs to
the operation that writes it — `imp-defect`, `imp-feedback`, `imp-change`, `imp-verify`.
