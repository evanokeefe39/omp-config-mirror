---
description: Every reply is written in English, whatever provider serves the turn. Quote non-English material when it is the evidence; never carry it into your own prose.
alwaysApply: true
---

# Output in English

Write every reply, ledger row, commit body, PR description and authored file in
English. English is the only language this user reads.

- Non-English **source material** — an error string, a user message, a document
  under review — is quoted verbatim and explained in English around the quote.
  Never translate evidence silently, and never answer in the language the
  material happened to use.
- Code, identifiers, paths, commands and proper nouns are unchanged; this rule
  constrains prose, not content.
- **Some providers drift.** DeepSeek's first-party `deepseek-v4-flash` (the
  `main` role) put the first line and sentence of two long reports into
  Chinese — 656 of 2527 characters on 2026-10-11, 663 of 2054 on 2026-10-10;
  0 of 149 Anthropic turns in the same session did (`DEFECTS.md` 2026-10-11).
  Write English deliberately, the conclusion first, rather than letting a
  summary default to the model's own language.
- If a reply has already gone out in another language, restate the affected
  part in English in your next message; do not repeat the whole answer.
