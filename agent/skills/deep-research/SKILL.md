---
name: deep-research
description: >
  Multi-hop, source-heavy research via Perplexity Deep Research on the user's
  Pro subscription (no API credits). Use for "research X thoroughly", comparative
  analyses, literature-style surveys, market/due-diligence questions. Do NOT use
  for quick lookups or current-fact checks — use the web_search tool for those;
  this costs a scarce monthly Research quota and takes 1-5 minutes.
---

# Perplexity Deep Research (Pro plan, no API credits)

**Provider: Perplexity.** This runs through `pwm` (`perplexity-web-mcp-cli`),
which drives the Perplexity web session — the account's own **Pro subscription**,
not the pay-as-you-go API. No `PERPLEXITY_API_KEY` is used and no API credits are
spent.

**Quota is separate and monthly.** Deep Research draws from a pool distinct from
Pro Search and is deliberately scarce — that is why this is on-demand only, never
automatic. Check what is left with:

```bash
pwm usage
```

The balance is shown on the account's Perplexity page, not in omp.

Run:

```bash
bash skill://deep-research/scripts/deep-research.sh "<question>"
```

## Running the script

**On Windows this box, `bash` resolves to WSL (`C:\WINDOWS\system32\bash.exe`),
which cannot run the script.** Call Git Bash explicitly:

```
"/c/Program Files/Git/bin/bash.exe" skill://deep-research/scripts/deep-research.sh "<question>"
```

On Linux/macOS/other POSIX shells the plain form works:

```bash
bash skill://deep-research/scripts/deep-research.sh "<question>"
```

## Rules

- **On demand only.** Never call this for routine lookups. One call consumes a
  Deep Research quota slot (separate from Pro Search) and takes 1-5 minutes.
- **Relay the output verbatim.** The script returns the answer with numbered
  citations. Do not summarise away the citations, and never invent sources.
- **The bash tool default timeout is 300s; research often exceeds it.** Pass
  `timeout: 600` to the bash tool when calling the script.
- **On failure the script exits non-zero with the reason on stderr.** Report it;
  do not retry blindly. Exit codes: `2` no query, `3` auth store/Python missing,
  `4` no/empty Perplexity credential, `127` pwm not installed, `1` pwm failed or
  returned an empty/malformed answer. A `403`/`401` means the session expired —
  re-run `/login perplexity`.

## Auth

The script reads the session token that omp already stores (`agent.db`,
written by `/login perplexity`) and passes it to `pwm`. No separate login and
no API key.
