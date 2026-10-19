---
description: "herdr is driven only when the user asks for it; its managed integration file is never hand-edited; and a session that works in a git worktree is started in that worktree, because the command guard reads the session's own cwd and not the bash tool's. The CLI surface and the rest of the standard are in skill://herdr-conventions."
---

# herdr is the user's tool, not the agent's

Three constraints, all of which have to hold before the work starts.

- **Use herdr only when the user asks.** A task that could benefit from a background
  terminal, delegation or parallel work is not a reason to open a pane.
- **Never hand-edit `agent/extensions/herdr-omp-agent-state.ts`.** herdr installs,
  versions and overwrites it. Check with `herdr integration status`, update with
  `herdr integration install`, and put custom hooks and plugins beside it.
- **A session that works in a worktree is started in that worktree.** The command
  guard resolves the repository from the command and falls back to the session's own
  directory; the bash tool's `cwd` parameter never reaches it, so a commit that sets
  only that parameter is refused. Name the worktree in the command (`cd <worktree> &&`
  or `git -C <worktree>`), or start the session in it. Recorded in
  `agent/docs/guards.md`.

CLI surface, the gate (`HERDR_ENV=1`), the pane and agent primitives, and the worktree
seam: `skill://herdr-conventions`.
