---
description: Block pip install — always use uv instead
---

# Use uv, not pip

Enforcement is the **`command-guard` hook** (`hooks/pre/command-guard.ts`, check
`uv-not-pip`), which blocks the pip-install family at the tool call — including
the `python -m` form and across a shell line continuation.

This rule previously also carried a TTSR `condition` covering the same pattern.
It registered, so unlike `git-conventions` it did fire — but only as a *nudge*,
alongside a hook that already blocks. `AGENTS.md`: never use a TTSR rule where a
hook will do. The rule stays as the rulebook entry, so the behaviour is
documented where it is named.

**Do not add a condition here.** If enforcement needs to change, change the hook.

**Never run `pip install` directly.** Use `uv tool install` for CLI tools
or `uv pip install` for project dependencies. `uv pip install` is fine — it's
the sanctioned replacement.

| Instead of | Use |
|------------|-----|
| `pip install <pkg>` | `uv tool install <pkg>` or `uv pip install <pkg>` |
| `pip3 install <pkg>` | `uv tool install <pkg>` |
| `python -m pip install <pkg>` | `uv pip install <pkg>` |
