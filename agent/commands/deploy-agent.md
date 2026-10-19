# /deploy-agent — deploy / dispatch an AI coding agent to a remote host

Invoke the `deploy-agent` skill for full guidance: resolve the named agent(s),
validate remote-deployability from their docs, interview the user (agents,
budget, infra, networking, tooling preference), produce a plan, execute after
approval, verify, and cache what you learned.

Run the skill now:

- Bare: load and follow the skill, discovering installed agents first.
- With targets: `deploy-agent <agent>[, <agent>...]` to resolve and deploy the
  named harness(es).

Read the skill body first (`skill://deploy-agent`), then its `references/` for
the interview, deployment modes, and herdr/moshi wiring as the loop requires.
