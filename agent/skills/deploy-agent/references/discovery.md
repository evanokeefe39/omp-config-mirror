# Discovery — find agents on a machine

Discovery is **agent-driven**, not a script. The invoking agent uses glob/grep
against the well-known harness home conventions and reports what it finds.
This adapts automatically to agents we don't list here, and requires no
tooling to maintain.

## Known harness homes (convention, not a hard contract)

| Harness | Typical home(s) | Notes |
|---|---|---|
| Oh My Pi (omp) | `~/.omp` | config under `~/.omp/agent` |
| Pi | `~/.pi` | agent under `~/.pi/agent` |
| Claude Code | `~/.claude` | |
| Codex | `~/.codex` | |
| Hermes | `~/.hermes` | |
| OpenClaw | `~/.openclaw` | verify against its docs |

Check `home_env` overrides if known (e.g. `PI_CODING_AGENT_DIR`,
`HERMES_HOME`).

## How to scan (no script)

1. For each candidate home above, list the directory (`glob`/`read` the dir).
   A non-empty, recognized layout means "installed".
2. For each detected harness, note:
   - the home path and whether it looks like a config root,
   - the config and any memory/data subdirectories,
   - whether a private backup repo exists locally (e.g. `~/repos/<name>-*`
     with a git remote) — this tells you a git source may be available,
   - whether the harness looks remote-deployable at a glance (defer real
     judgment to `research-methodology.md`).
3. Emit a numbered report:

```
Discovered agents on this machine:
  [1] omp    home=~/.omp       config=yes  memory=yes  git-source: example-config, example-data
  [2] pi     home=~/.pi        config=yes  memory=no   git-source: none
  [3] hermes home=~/.hermes    config=yes  memory=yes  git-source: none
```

4. Ask the user which to deploy. The report is a menu, not an instruction to
   act — the user decides.

If a named `/deploy <agent>` was given instead, resolve that harness's home
directly and skip straight to validation; only fall back to this scan if the
named harness can't be found.

Be honest: report "not found" / "no git source" rather than guessing.
