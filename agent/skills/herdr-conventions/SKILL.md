---
name: herdr-conventions
description: >
  How this house drives herdr — the terminal workspace manager every omp session
  runs inside — and how herdr composes with omp's command guard when work happens in
  a git worktree. Defers to the installed binary for the CLI surface. Use when a task
  mentions herdr, when starting or inspecting agent panes, when creating a
  worktree-backed workspace, or when several main sessions must work at once.
---

# herdr conventions

herdr is the terminal workspace manager this machine runs coding agents inside
(`HERDR_ENV=1`). It owns the terminal topology — workspaces, tabs, panes — and it
recognises the agent occupying a pane, so it can start one, prompt it, wait on it and
read its state. This file is the house standard for using it. **It is not the CLI
reference.**

## Precedence

The installed binary outranks this file for every fact about the CLI. Read it; never
recall it.

| what you need | run |
|---|---|
| the vendor's own skill — the gate, IDs, primitives, agent lifecycle, panes, machines | `herdr --skill` |
| the command syntax of one group | `herdr <group>` with no subcommand |
| first-time setup or debugging | `https://herdr.dev/agent-guide.md`, `https://herdr.dev/llms.txt` |

`herdr --skill` prints about 200 lines. Read the section you need rather than pulling
it into context whole. A repo's own `AGENTS.md` may add detail; it cannot remove the
gate below.

## The gate, before any control command

`test "${HERDR_ENV:-}" = 1`. If it fails, say you are not running inside herdr and
stop — never inspect or control a herdr session from outside one. Two more from the
vendor skill, because both fail silently: **do not run bare `herdr`** (it launches or
attaches the TUI), and **do not probe a mutating command by omitting its arguments**
(`herdr workspace create` is valid with defaults and will execute).

## House rules

- **Use herdr only when the user asks for it.** A task that could benefit from a
  background terminal, delegation or parallel work is not a reason. This is the
  vendor's own rule and the one an eager agent breaks first.
- **Never hand-edit `agent/extensions/herdr-omp-agent-state.ts`.** herdr installs it,
  versions it (`HERDR_INTEGRATION_VERSION`) and overwrites it on update. Check with
  `herdr integration status`; update with `herdr integration install`; put custom
  hooks and plugins beside it.
- **IDs are opaque, workspace-qualified and scoped to one server** (`w1`, `w1:t1`,
  `w1:p1`). Read them from the response that created them; a moved pane gets a new
  ID; two saved SSH machines can both have `w1:p1`. Never predict an ID.
- **Agent state is not completion.** `idle` and `done` both mean ready for input;
  `blocked` means an approval or question dialog is waiting for a human; `unknown`
  means herdr cannot classify the agent and proves nothing. A timeout or a stalled
  prompt does not prove the prompt was never delivered — inspect `herdr agent get`
  and `herdr agent read` before sending it again.

## Work in a worktree, one per unit

herdr manages git worktrees as workspaces (`herdr worktree create`, `herdr worktree
open`, `herdr worktree list`, `herdr worktree remove`). **Pass `--cwd <repo>` to
`worktree list`**: without it herdr reports the workspace the session has focused, not
the repository your shell is in — measured 2026-10-12, where the bare form answered
`example-ext` from three different cwds while `--cwd` on `.omp` answered
`.omp`. The omp seam is one fact with a sharp edge:

> **The command guard resolves the repository from the command, not from the bash
> tool's `cwd` parameter.** It honours a leading `cd <path> &&` and a `git -C <path>`,
> and otherwise falls back to the session's own directory. So a commit issued with only
> the tool's `cwd` set to a worktree is refused; one that names the worktree — or is
> issued from a session rooted in it — commits and pushes that branch normally, and the
> main checkout stays protected.

So one worktree per unit of work, and the session that works in it is started *in* it:
`omp --cwd=<path>` does that from anywhere, as does launching omp with the worktree as
the process cwd. From a session rooted elsewhere, name the worktree in the command —
`cd <worktree> && git commit …`, or `git -C <worktree> …` — which is the workaround
`agent/docs/guards.md` records. Setting only the bash tool's `cwd` parameter changes
nothing, because that parameter never reaches the guard.

```
herdr worktree create --branch <kind>/<id lowercased>-<slug> --base main --path <abs path> --focus
herdr agent start <name> --kind omp --pane <pane-id>
herdr agent prompt <name> "…" --wait --timeout 120000
herdr agent read <name> --source recent-unwrapped --lines 120
```

Flags come from `herdr worktree create --help` and `herdr agent start --help`; the
check below keeps the groups and subcommands honest.

Two more, from git rather than from herdr:

- **Never a shared `dev` branch.** Trunk-based with squash-merge is the standard, so
  a worktree branches off the default branch like any other work and each PR keeps
  `main` as its base (`skill://git-conventions`, `skill://pb-open-pr`).
- **Only one checkout can hold `main`**, and it is the primary tree — the daily sync
  fast-forwards that tree only. The four ledgers are repo files, so each worktree
  carries its own copy: two branches that touch the same ledger conflict at PR time.

## Verification

`agent/scripts/herdr-skill-check.py` — every `herdr <group>` and every path named in
this file resolves against the installed binary, so a herdr update that renames a
command fails the check instead of leaving this standard quietly wrong. It reads the
other skills that carry herdr invocations too (`handoff`, `deploy-agent`, `dispatch`),
so the house's whole surface is covered rather than only the copy written here.
