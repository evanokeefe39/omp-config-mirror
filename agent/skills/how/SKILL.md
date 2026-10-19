---
name: how
description: "Use for \"how does X work\", code walkthroughs before changing something, and placement / ownership / layering questions (\"where should this live\", \"which package owns this\", \"is this the right layer\"). Explains subsystem architecture, runtime flow, onboarding mental models. Regression history uses git log, git blame and the scope's DEFECTS.md."
metadata:
  source: "pstack@157aae39 skills/how"
  license: "MIT — skill://operating-mode/LICENSE-pstack.txt"
---

# How

Explore the codebase to answer "how does X work?" questions. Produce architectural explanations at the level of a senior engineer onboarding onto a subsystem, enough to build a working mental model, not so much that it reads like annotated source code.

## Step 1. Assess complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple** (a single module, a small utility, a narrow question such as "how does function X work"): no explorers. One explainer explores and explains in a single pass. Go to Step 2b.
- **Complex** (a subsystem spanning multiple files or services, a cross-cutting feature, a full architectural overview): spawn parallel explorers first, then hand off to the explainer. Go to Step 2a.

When in doubt, take the simple path.

## Step 2a. Explore (complex questions only)

Decompose the question into 2 to 4 exploration angles, each a distinct slice of the subsystem. Spawn all explorers in a single `task` batch, each with the `scout` agent so the batch is read-only and parallel:

- Give each explorer the prompt in `references/explorer-prompt.md` with its angle filled in.
- One `task` call, one `tasks[]` entry per angle.

Then go to Step 3.

## Step 2b. Direct explain (simple questions)

One pass, no separate explorer: read the code and write the explanation yourself, or dispatch a single `scout` with the prompt in `references/explainer-prompt.md` without the explorer-findings section. Go to Step 4.

## Step 3. Synthesize (complex questions only)

Once all explorers return, write the explanation yourself from the prompt in `references/explainer-prompt.md` with every explorer's findings filled in. The calling session is the explainer; you already hold the conversation context the explorers lacked.

## Step 4. Present

Present the explanation to the user. Light edits for clarity or context from the conversation are fine. Do not substantially rewrite it.

## Output format

The explanation uses the sections defined in `references/explainer-prompt.md`, dropping any that do not apply: Overview, Key Concepts, How It Works, Where Things Live, Gotchas.
