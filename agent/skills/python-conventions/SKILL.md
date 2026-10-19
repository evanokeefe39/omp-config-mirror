---
name: python-conventions
description: >
  Global Python conventions — always use uv over pip, no exceptions; ruff with
  PEP 8 (E/W/F) as errors, a global default plus a per-project ruff.toml.
alwaysApply: true
---

# Python Conventions

**Always use `uv` instead of `pip`.** `uv` is 10–100x faster, handles
virtualenvs automatically, and avoids pip dependency resolution pain.

| Instead of | Use |
|------------|-----|
| `pip install <pkg>` | `uv tool install <pkg>` (CLI tools) or `uv pip install <pkg>` (project venv) |
| `pip install --user <pkg>` | `uv tool install <pkg>` |
| `python -m venv .venv && pip install ...` | `uv sync` (with pyproject.toml) |

**Rule:** never type `pip install` in any command, script, or doc. Always
`uv tool install` for CLI tools, `uv pip install` for project deps.

If `uv` is not installed:
- Windows: `powershell -c "irm https://astral.sh/uv/install.ps1 | iex"`
- Unix: `curl -LsSf https://astral.sh/uv/install.sh | sh`

## Linting: ruff, PEP 8 as errors

Ruff is installed globally with `uv tool install ruff` (upgrade: `uv tool upgrade ruff`).
The machine-wide default is `%APPDATA%\ruff\ruff.toml` (Windows) or
`~/.config/ruff/ruff.toml` (Unix):

```toml
[lint]
select = ["E", "W", "F"]  # E/W = PEP 8 errors/warnings, F = pyflakes
```

Ruff reads the global file **only** when a project has no config of its own. Every
new Python project gets a `ruff.toml` at its root with at least the block above.
Change strictness per project there, e.g. `line-length`, or add `I`, `B` and `UP`.

- One config per project: a `ruff.toml` makes ruff ignore `[tool.ruff]` in
  `pyproject.toml`. If a project already has `[tool.ruff]`, extend it there.
- Ruff has no warning level: every selected rule fails `ruff check` (exit 1).
- E1/E2/E3 (indentation and whitespace) are preview-only in ruff. `select = ["E"]`
  skips them unless `preview = true` is set under `[lint]`. `ruff format` covers
  most of the same ground.
- Check: `ruff check --show-settings <file>` prints the `Settings path` that
  actually applies.
