---
name: deploy-agent
license: MIT
version: 0.1.0
description: >
  Guided deployment of AI coding agents (Oh My Pi, Pi, Hermes, OpenClaw, Claude
  Code, Codex, and others) to a remote host so they can be controlled via Herdr
  and Moshi, and dispatching tasks to a deployed remote agent (dispatch is
  folded into this skill). Guidance-first: it never hardcodes harness-specific
  requirements.
  For the desired agent(s) it discovers/resolves them, validates
  remote-deployability from each harness's own docs, and interviews the user
  about their agents, budget, cloud infra, networking, and tooling preference
  (Terraform vs ad hoc shell scripts) before detailing and executing the steps.
  Use when asked to deploy, replicate, provision-target, dispatch, or set up an
  agent on a server/VPS. Bare /deploy-agent discovers agents on this machine
  and asks which to deploy; /deploy-agent <agent> targets one. Quality depends
  on how well the invoking agent does its research and implementation — see references/.
---

# deploy-agent

A guidance-first playbook for getting AI coding agent(s) running on a remote
host, controlled via **Herdr** (agent-aware terminal multiplexer) and **Moshi**
(mobile push notifications + Easy Pair QR). The north-star is always the same:
agent(s) you can reach from a laptop over SSH and from a phone over Mosh, with
herdr multiplexing them and moshi-hook notifying you.

## Remote mode (recommended) vs local mode

The north-star (agent reachable via herdr + moshi) is normally met in **remote
mode**: the agent runs on a host (Hetzner, AWS, Azure, GCP, a spare box) and
both the laptop (SSH/Mosh) and the phone (Moshi → Mosh) connect *out* to it.
The local machine is never exposed, nothing is inbound to it, and the agent
stays available even when the laptop is off.

**Local mode** (target = this machine, wire herdr + moshi-hook here) is only a
fallback for when the machine can be left on and reachable and you accept it
being a connection target. It is NOT the default and is excluded by the usual
security posture (don't expose a desktop over the internet to be controlled by
Moshi).

The infra interview (`references/infra-interview.md`) establishes which the
user wants. Everything else in this playbook is the same either way; the
"target" is an SSH host in remote mode and `localhost` in local mode.

## When to use

- The user wants one or more agents running on a server/VPS, reachable via
  herdr and moshi.
- `/deploy-agent` (discover first) or `/deploy-agent <agent>` (target one or
  more).
- Any "set up an agent remotely", "deploy my agents", "replicate to a VPS"
  request.

## Invocation

- **Naked `/deploy-agent`** — discover agents on this machine, then ask which
  to deploy.
- **`/deploy-agent <agent>[, <agent>...]`** — resolve the named agent(s)
  directly (e.g. `/deploy-agent omp`), then run the same loop from step 2.

## The core loop

Run this for whatever agent(s) are chosen. Every step is agent-driven; only
the mechanical/security bits call the scripts in `scripts/`.

1. **Locate the agent(s).**
   - Naked: discover via `references/discovery.md` (glob/grep the known
     harness homes — no script). Report what's installed and ask which to
     deploy.
   - Named: resolve each harness's home and config by convention (`~/.omp`,
     `~/.pi`, `~/.hermes`, ...). If one can't be found, say so and fall back to
     discovery.
2. **Validate remote-deployability (docs-first).** For each chosen harness,
   read its official docs and determine: does it run headless/remotely? what
   runtime does it need (node/bun/python/systemd/...)? what config does it
   require, and can that config be transported? Follow
   `references/research-methodology.md`. If a harness cannot be validated as
   remotely usable, state that plainly and adapt (or drop it) — never invent a
   procedure.
3. **Interview the user.** Follow `references/infra-interview.md`. Establish:
   desired agents and what they must do; **budget**; **existing cloud infra**
   (Hetzner / AWS / Azure / GCP / spare box) or provision fresh; **networking**
   and how they'll reach it (laptop SSH, phone Mosh, notifications); and their
   **tooling preference** (Terraform/Infra-as-Code vs ad hoc shell scripts).
   The answers decide the provisioning path and what additional info is needed.
4. **Decide and detail the plan.** From the interview, determine what's
   required: provisioning approach (chosen by the user's preference, not the
   skill's), target host + SSH access, a deploy key if there are private config
   repos, runtime installs, and exact config placement. Produce a concrete plan
   with the impact (what would be added/overwritten on the target) and a cost
   note for any paid infra.
5. **Approve.** Present the plan. On a fresh host with no existing home this is
   additive and safe; anything overwriting existing files needs explicit user
   approval before executing.
6. **Execute.** Provision if needed (per the user's chosen approach), install
   runtimes, deploy config, and wire the north-star. See
   `references/deployment-modes.md` for transport and
   `references/herdr-moshi-wiring.md` for the universal control layer.
7. **Verify.** Run `scripts/verify-remote.sh` (binaries, config placement,
   ownership, herdr/moshi reachable). Confirm the user can reach the agent from
   a laptop (SSH) and a phone (Mosh + Moshi push).
8. **Cache what you learned.** After a proven deploy, write the validated steps
   to `references/<agent>.md` so the next deploy of that harness is fast.
   Re-validate against docs before trusting the cache.

## Dispatch

Sending a task to a deployed remote agent is folded into this skill — no
separate dispatch skill. The full playbook lives in
`references/dispatch.md`; the short version:

- **Herdr-native** (both ends run herdr): `herdr --remote ssh://user@host`
  attaches a thin local client to the remote herdr server, then
  `herdr agent prompt <target>` / `herdr pane send-text` deliver the task
  inside the remote session — visible on the phone via Mosh.
- **Headless CLI over SSH** (programmatic/one-shot): run the remote agent
  non-interactively, e.g. `ssh deploy@host 'cd ~/workspace/<repo> && omp
  --print "task…"'` or `omp --mode=rpc` for structured output; verify the
  harness's own flags from its docs.
- The **local session stays the orchestrator**: it prepares the remote
  workspace (repo present + correct cwd + revision), sends a self-contained
  task as an opaque quoted payload, and receives the result. Never dispatch
  into a missing repo — that's a silent no-op.

## Constraints / anti-patterns

- **Never hardcode a harness's requirements into the skill.** Research each at
  deploy time. A reference cache is fine; an unvalidated assumption is not.
- **Respect the user's tooling preference.** Don't impose Terraform on someone
  who wants scripts, or vice versa; offer the tradeoff and let them choose.
- **Restore = the sync + mirror.** Same pipeline that backs the harness up:
  `agent/scripts/omp-git-sync.sh` commits and pushes the config repo
  (`evanokeefe39/omp-home`), and `evanokeefe39/example-data` mirrors the usage
  ledger and generated memory tree to R2 (see `references/deployment-modes.md`).
- **Never write to a remote home without a plan + approval** for anything that
  overwrites or deletes. Fresh-host additive deploys are the safe exception.
- **Never put secrets in committed files.** Deploy keys and API tokens are
  injected via SSH (0600 on the box) or per-repo deploy keys —
  `scripts/deploy-key.sh`. `auth.json`-style secrets are not transported; the
  user refreshes them on the box.
- **Run as a non-root deploy user** into its own home, never as root.
- **No silent partial state.** Deploys snapshot before overwriting and verify
  after; a failed verify is surfaced, not papered over.

## References

| When you need this | Read |
|---|---|
| Find what's installed on a machine | `references/discovery.md` |
| Determine if a harness runs remotely | `references/research-methodology.md` |
| What to ask the user (agents/budget/infra/networking/tooling) | `references/infra-interview.md` |
| Transport config to the host | `references/deployment-modes.md` |
| Wire herdr + moshi control | `references/herdr-moshi-wiring.md` |
| Keep it alive across reboots (systemd/linger/tmux/supervisor) | `references/reliability.md` |
| Send a task to the deployed agent | `references/dispatch.md` |
| A harness you've already deployed before | `references/<agent>.md` (cache) |

## Scripts

- `scripts/deploy-key.sh` — secure read-only access to private config repos.
  One ed25519 deploy key PER repo (GitHub scopes a deploy key to a single
  repo — run it once per private repo with a distinct key-name); private key
  pushed 0600 over SSH; prints the public key for registration. Never stores
  key material in the repo.
- `scripts/verify-remote.sh` — post-deploy health check over SSH (binaries,
  herdr/moshi reachable; pass `--home <path>` to also assert config ownership
  and print config file hashes for comparison).
