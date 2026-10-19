---
name: dispatch
license: MIT
version: 0.1.0
description: >
  Bidirectional session dispatch (handoff) between a local (laptop) agent and a remote
  (Hetzner box, reachable via Herdr + Moshi) agent. Sessions are
  machine-local and cannot be migrated; handoff carries CONTEXT (a committed
  HANDOFF.md) and keeps files in sync via git (scripts/dispatch.sh). Use when
  the user wants to continue a laptop session on their phone (hand off to the
  box) or bring a box session back to a local agent.
---

# handoff — move an agent session between laptop and box

Handoff is a **context handoff, not a process migration**. The target agent
has no memory of the source session, so you never claim continuity — you carry
a summary and start a new session on the target that reads it. The files move
over git; the context moves as `HANDOFF.md`.

## The two operations (git-remote-mediated — the box never pushes to the laptop)

Everything syncs through the shared git remote (GitHub): the box can't reach
the laptop, and the phone talks only to the server. So:

| Operation | Trigger | What happens |
|---|---|---|
| **`--push`** (laptop → box) | user leaves the desk, wants to continue on the phone | laptop commits + pushes to the git remote; box clones/pulls; a new box session reads `HANDOFF.md`; phone reaches it via Moshi |
| **`--pull`** (box → laptop) | user wants the task back on the laptop (offline/local tools) | box commits + pushes to the git remote; laptop pulls; a new local session reads `HANDOFF.md` |

Topology: 1 laptop + 1 server + 1 phone. The laptop runs herdr (local + remote
agents); the phone talks to the server only via Moshi. Run `dispatch.sh` from
the laptop (it can SSH to the box); the box-side half (commit + push) can also
be triggered on the server via herdr (from the laptop) or Moshi (from the
phone) — the git remote is the shared medium either way.

## The protocol (follow in order)

1. **Write the summary.** In the SOURCE session, create `HANDOFF.md` at the
   repo root. It must be self-contained enough for a fresh agent to continue:
   - the goal and what's already done,
   - current state / where things stand (files touched, decisions, open
     questions),
   - the concrete next step(s),
   - any paths, commands, or constraints the target needs.
   Commit it (part of the dispatch sync).
2. **Sync files** (from the laptop — it orchestrates both ends; the box side
   can also be triggered on the server via herdr/Moshi):
   - push (laptop → box): `bash scripts/dispatch.sh --push --repo /path/to/repo`
   - pull (box → laptop): `bash scripts/dispatch.sh --pull --repo /path/to/repo`
   The script commits+pushes the source, then clones (if missing) or pulls on
   the target, so the workspace is in sync. It fails loudly on any missing
   piece — never run it with a dirty/unsynced workspace or no `HANDOFF.md`.
3. **Start the target session seeded with the summary.** Open a Herdr session
   on the target (box: via Moshi/Mosh or `ssh` + `herdr`; laptop: `herdr`) and
   tell the new agent to read `HANDOFF.md` and continue. Point it at the
   correct working directory (`~/workspace/<repo>` on the box, the repo dir on
   the laptop) — never `$HOME`.

## Prerequisites / fail-safes

- The **box must be running** and reachable (`BOX_HOST` set); otherwise the
  script errors — start it first.
- The **box must have an SSH key that can access the repo on GitHub** (clone
  AND push, since `to-local` pushes from the box). Ensure it via
  `scripts/copy-secrets.sh` or a box key added to GitHub.
- **`HANDOFF.md` missing** → the script stops; the source agent must write it
  first. Never hand off without context.
- **Target repo dirty / pull conflict** → the script reports and aborts; do not
  clobber uncommitted target work.
- Always verify the sync succeeded (the script's output) before telling the
  user the target session is ready.

## Phone caveat

Handoff to the box makes the task reachable from the phone **only if** the new
session runs on the box. Starting the box itself from a phone (cold start)
needs the wake endpoint, not this skill.
