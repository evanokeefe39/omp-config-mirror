# Research methodology — validate an agent is remote-deployable

The skill never hardcodes a harness's requirements. For whichever agent is
chosen, the invoking agent validates remote-deployability from the harness's
**own documentation** before proposing anything. Work from primary sources
(the harness's repo README, install docs, CLI help) and cite them in the plan.

## Checklist — can this agent run and be controlled remotely?

Answer each from docs (not from memory):

1. **Runtime.** What does it need? node/bun/python/systemd/a bundled binary?
   What versions? Is it supported on the target OS (e.g. Ubuntu 24.04)?
2. **Headless / remote operation.** Does it run as a terminal/CLI process you
   can drive over SSH (inside a multiplexer like herdr/tmux)? Or does it
   require a GUI / local loopback service / specific hardware? If it needs a
   local-only sidecar or a non-headless component, note the implication for
   remote control.
3. **Configuration.** Where does config live, and what does it contain? Which
   parts are transportable (settings, skills, rules, memories) vs which are
   machine-local secrets that must be provisioned on the box (API keys,
   auth.json, tokens)?
4. **Interaction model.** How does the user talk to it — an interactive REPL,
   a long-running daemon, a TUI? This determines whether herdr (multiplexer)
   and moshi-hook (event push) are the right control layer, or whether
   something else is needed.
5. **First-run / setup.** What happens on first launch (wizard, credential
   prompt, model selection)? Can that be done non-interactively, or does it
   need one interactive session on the box?
6. **Persistence.** Does it keep state across sessions (history, memories,
   DB)? Where, and is that state deployable?

## Output

A short validation note the plan references:

```
hermes: runs as a CLI over SSH (no GUI); runtime = <x>; config at ~/.hermes
(transportable: settings, skills; machine-local: auth). First-run is
interactive (credential prompt). Remote-deployable: yes, after one manual
auth on the box.
```

## Rules

- If docs don't establish remote usability, say so and either research deeper
  or report the gap — never fabricate a procedure.
- Distinguish "validated from docs" from "inferred". Only validated facts go
  into the reference cache after a successful deploy.
- Record the doc URLs so the user (and a later agent) can re-check.
