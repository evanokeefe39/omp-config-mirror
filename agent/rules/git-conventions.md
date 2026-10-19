---
description: Enforce conventional commit format and prevent direct pushes to main
---

# Git conventions enforced

Enforcement is the **`command-guard` hook** (`hooks/pre/command-guard.ts`), which
intercepts these at the tool call: non-conventional `-m`, a commit or push while
HEAD is `main`/`master` (including by refspec), and a bare `git merge`. It blocks.

This rule previously also carried a TTSR `condition` covering the same three
patterns. That condition **never registered** — its frontmatter failed YAML
parsing, so the rule silently fell through to the rulebook and became advisory
only. The hook was carrying the whole load, which is correct anyway: a TTSR rule
nudges on prose and tool text, a hook blocks on state, and `AGENTS.md` says never
to use the former where the latter will do.

**Do not reinstate a condition here.** If enforcement needs to change, change the
hook.

## Commit messages

All commits MUST use conventional format:

```
type(scope): imperative summary
```

Examples:
- ✅ `feat(auth): add OAuth2 login`
- ✅ `fix: handle null response from API`
- ✅ `docs(readme): update install instructions`
- ❌ `fixed the bug`
- ❌ `WIP`

## No direct push to main

Never `git push origin main`. Always work on a branch, push the branch,
and squash-merge via PR.

## No merge commits

Never run bare `git merge`. For pulling in upstream changes, rebase:
`git rebase main` while on your feature branch. PRs squash-merge only.

---

These conventions apply to all professional repos (~90%). If this is a
casual/throwaway repo, acknowledge and proceed.
