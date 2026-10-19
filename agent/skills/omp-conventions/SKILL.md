---
name: omp-conventions
description: Where omp's own version-pinned docs are for each harness artifact — rules, skills, agents, hooks, commands, extensions, tools, settings, SYSTEM.md. Read before changing OMP config; the omp:// doc is the authority.
---

# omp-conventions — where the vendor docs are

## Authority

omp embeds its docs for the running version at `omp://` (`read omp://` lists them). They
are the vendor's conventions; this index copies no facts, so it cannot go stale. Where
anything disagrees with an `omp://` doc, the doc wins. GitHub `main` docs may be ahead of
the installed version; use them only for features the installed version lacks, and say so.

## Read first, per artifact class

| artifact | read first | then |
|---|---|---|
| skill | `omp://skills.md` | — |
| extension | `omp://skills/authoring-extensions.md` | `omp://extensions.md`, `omp://extension-loading.md` |
| hook | `omp://skills/authoring-hooks.md` | `omp://hooks.md` |
| rule / TTSR | `omp://rulebook-matching-pipeline.md` | `omp://ttsr-injection-lifecycle.md` |
| agent | `omp://task-agent-discovery.md` | — |
| command | `omp://slash-command-internals.md` | — |
| custom tool | `omp://custom-tools.md` | — |
| settings / config | `omp://settings.md` | `omp://config-usage.md` |
| system prompt | `omp://system-prompt-customization.md` | — |
| context files | `omp://context-files.md` | — |
| plugin / marketplace | `omp://marketplace.md` | `omp://skills/authoring-marketplaces.md` |
| MCP | `omp://mcp-config.md` | — |

## Bundled rules

omp ships `ts-*`, `go-*` and `rs-*` TTSR rules. Read any via `rule://<name>`, and do not
re-author them. Disable one via `ttsr.disabledRules`, per
`omp://ttsr-injection-lifecycle.md`.

## Probe the running version

`omp --version`, and the installed typings for any API.