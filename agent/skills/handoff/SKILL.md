---
name: handoff
license: MIT
version: 0.1.0
description: >
  Hand off an IN-FLIGHT coding/data workstream to a REMOTE SERVER — the Hetzner
  box — so a herdr-managed agent continues it there, phone-reachable via Moshi
  (push, laptop → server), or bring a server workstream back to the laptop
  (pull, server → laptop). Carries CONTEXT (a committed HANDOFF.md) and syncs
  files via git (scripts/handoff.sh); starts the target agent in a herdr session
  on the server seeded with the handover message. Use when leaving the desk and
  wanting a running remote agent to pick up laptop work, or to continue box work
  on the laptop. NOT deploy-agent (provisioning) and NOT a process migration.
---

# handoff — move an in-flight workstream between laptop and box

Handoff is a **context handoff, not a process migration**. The target agent has
no memory of the source session; you carry a curated summary (`HANDOFF.md`) and
start a NEW agent on the target that reads it and independently verifies the
work before continuing. Files move over git; context moves as the handover doc.

## The two operations (git-remote-mediated — the box never pushes to the laptop)

Everything syncs through the shared git remote (GitHub): the box cannot reach
the laptop, and the phone talks only to the box. The box workspace is
`~/repos/<repo>` on the box (NOT `~/workspace`).

| Operation | Trigger | What happens |
|---|---|---|
| **`--push`** (laptop → box) | user leaves the desk, wants the box agent to continue | laptop commits + pushes to git remote; box pulls; a new box herdr session starts an omp agent seeded with `HANDOFF.md`; phone reaches it via Moshi |
| **`--pull`** (box → laptop) | user wants the task back on the laptop | box commits + pushes; laptop pulls; a new local session reads `HANDOFF.md` |

The box-side half (commit + push) can also be triggered on the box via herdr or
Moshi — the git remote is the shared medium either way.

## When NOT to use

- **Provisioning a new agent** → use `deploy-agent`, not this skill.
- **A one-shot task to a running remote agent** (no workstream to carry) →
  send the task via herdr `agent prompt`, not a full handoff.
- **Work that should run on the box from the start** → start it there; handoff
  is for work that already began elsewhere.

## The protocol (follow in order)

### 1. Source agent writes HANDOFF.md (curated summary, not a transcript dump)

At the repo root. Must be self-contained enough for a fresh agent to verify and
continue. Sections:

- **Goal** (one paragraph) + **Definition of done** as a checklist of
  externally checkable criteria (each "done when `<observable command>`").
- **Current state**: branch, last completed step, dirty-vs-clean status.
- **Next steps** (ordered, actionable), EACH with its own acceptance check
  ("done when `<command/output>`").
- **Key file paths** (repo-relative) + why each matters.
- **Decisions made & constraints discovered** (the "why", not just "what").
- **Open questions / risks / how to verify** — "how to verify" must name the
  actual command, not a description.
- **Data state** (if the workstream touches data — MANDATORY):
  - data objects touched: read-sources (with freshness/watermark at handoff)
    and write-targets (with schema/contract version),
  - invalidation blast radius: every downstream consumer (derived tables,
    dashboards, alerts) and the invalidation plan per consumer,
  - in-flight run state: is a backfill/incremental run mid-flight? Either
    stopped+checkpointed (resume key/offset/run id recorded) or declared
    abandoned, with an explicit fence on whether the box agent may write to
    in-flight targets,
  - verbatim data contracts/decisions that exist only in-session (column
    semantics, dedup rules, derivation logic) — NOT summarized.
  - **gitignored data that must travel**: for each gitignored path the target
    needs (e.g. `data/`, `media/`, a model artifact dir), name the repo-relative
    path. These do NOT move via git — they move via object storage (step 3b),
    and the target dir is written back into the same path on the receiving end.
- **Explicitly NO**: secrets, absolute paths, hostnames, usernames, sample
  data rows (PII), raw transcript dumps, connection strings. Reference data
  sources by logical name only.

**Scrub before committing**: grep the doc for `sk-`, `ghp_`, `AKIA`, `hcloud
_token`, `BEGIN.*PRIVATE KEY`, and any filename matching `secret|token|key`.
The script hard-fails the handoff if a denylisted file (e.g. `*.tfstate*`,
`.secrets/`, `terraform.tfvars`, `*.tfplan`) is staged.

### 2. Branch policy (commit the open work)

- **Default**: commit to the CURRENT in-flight branch (preserves review
  history of the real work). Record the branch + pushed SHA in HANDOFF.md.
- **Escalate to a dedicated `chore/handoff-<utc-date>-<slug>` branch** when: the
  current branch is `main`/`master`/protected, or the work is unrebased WIP
  that would collide with an open PR.
- Commit message: `chore(handoff): <utc-ts> (<branch>)` — a conventional
  `type(scope):` subject, so a script-made commit is the same shape the command
  guard's `branch-naming` and `conventional-commits` checks enforce on typed
  ones (OMP-15). Never a bare `handoff:` subject, and never a bare timestamp.
- **No force-push, ever.** Receiver pins to the recorded SHA.

### 3. Sync files

```bash
bash scripts/handoff.sh --push --repo /path/to/repo [--branch <branch>] [--session <name>] [--data data/] [--data media/]
bash scripts/handoff.sh --pull --repo /path/to/repo [--session <name>] [--data data/]
```

The script: prints the staged-file review (`git status --porcelain`), hard-fails
on the denylist, commits+pushes the source, then clones-if-missing else
`git fetch && git pull --ff-only` on the target (never auto-merge). Fails
loudly on any missing piece (no HANDOFF.md, box unreachable, git step fails,
provider.env missing, herdr not active). Never run with a dirty/unsynced
workspace or no HANDOFF.md.

### 3b. Gitignored data over object storage (R2)

Git does not carry gitignored data (a `data/` folder, media, model artifacts).
To hand those off, mirror each declared path between laptop and box through
Cloudflare R2 using `--data <relpath>` (repeatable, one per path):

- **push**: the laptop uploads the dir to R2 (`handoff/<repo>/<relpath>` prefix,
  rsync-style mirror), then the box downloads it into `~/repos/<repo>/<relpath>`.
- **pull**: the box uploads, the laptop downloads into the same repo-relative path.

`scripts/data-sync.py` (boto3) does the mirror, authenticating via a shared
`~/.aws` R2 PROFILE — `r2-handoff` → bucket `agent-handoff` by default
(overridable with `R2_PROFILE` / `R2_BUCKET` env). No R2_* secrets live in any
`.env` or on the box; each machine (laptop AND box) keeps that one profile in
its own `~/.aws/credentials` + `~/.aws/config`, and both must have boto3. The
prefix is stable and overwritten each handoff (one live copy, like HANDOFF.md).
Record the reference in HANDOFF.md so the receiving agent knows where the data
is:

```markdown
## Data handoff (object storage)
- data/  →  s3://<bucket>/handoff/<repo>/data      (target: ~/repos/<repo>/data)
- media/ →  s3://<bucket>/handoff/<repo>/media     (target: ~/repos/<repo>/media)
```

The data dir is a MIRROR (source is authoritative) — the receiving end must not
diverge from it without recording that in HANDOFF.md. If the source is empty,
the prefix is cleared so the target ends up empty too.

### 4. Start the target session seeded with the summary

`handoff.sh --push` does the spawn automatically (verified herdr 0.8.2
sequence): it creates a herdr workspace with `--cwd` at the box repo, starts a
fresh omp agent in its root pane seeded with the handover message, and lands it
in the persistent default session (phone-reachable via Moshi). No session file
is copied to the server — a FRESH agent reads HANDOFF.md and continues.

If running manually, the exact verified sequence is:

```bash
ssh omp-box 'bash -lc "export PATH=$HOME/.local/bin:$PATH; \
  WS=$(herdr workspace create --label handover --cwd ~/repos/<repo> | jq -r .result.root_pane.pane_id); \
  herdr agent start handover --kind omp --pane $WS --timeout 60000 -- \
    \"Read HANDOFF.md at the repo root and continue. We are handing over this workstream: <one-line>\" "'
```

The `--cwd` on `workspace create` is honored (the pane's shell is at the repo).
Everything after `--` is passed to omp as argv (the handover prompt). Use
`bash -lc` so PATH + `~/.omp/provider.env` resolve. Never `cd $HOME`, never
`nohup` (herdr is the supervisor; nohup dies on reboot and is phone-invisible).

**Post-start verification (mandatory)**: confirm the box herdr session actually
seeded and the agent took the prompt (`herdr agent get <name>` reaches
working/idle, or `herdr agent wait <name> --until working --until idle --until
done --timeout 60000`) BEFORE declaring the handoff done. Failure mode to catch:
"session started but seeding failed."

### 5. Receiver step-0 verification gate (MANDATORY)

The RECEIVING agent's very first action — before any new work:

1. `git fetch && git checkout <recorded SHA>` (pin to the handed-off revision).
2. Read `HANDOFF.md`.
3. Independently re-verify the "last completed step" claim by running the
   stated how-to-verify command.
4. Report `PASS` or a specific discrepancy in its first message.

A discrepancy is a STOP: surface it, don't paper over it. This converts the
handoff from "trust the source's self-report" to "verify then continue."

## Prerequisites / fail-safes

- **Box must be running + reachable** (`BOX_HOST`). Start it first if not.
- **Box needs an SSH key with access to the repo on GitHub** (clone AND push).
- **Box `provider.env` must exist** (`test -f ~/.omp/provider.env`) and **herdr
  must be active** (`systemctl --user is-active herdr`) — the script gates on
  both, else the seeded agent starts keyless or the spawn wedges.
- **`--data` needs R2 object storage on BOTH ends** — the R2 profile
  `r2-handoff` in each machine's own `~/.aws/credentials` (with `~/.aws/config`
  supplying the `endpoint_url`), plus **boto3** importable on both (laptop:
  present; box: `python3-boto3` via cloud-init). The script hard-fails if the
  profile or boto3 is missing rather than silently skipping gitignored data.
  `--data` paths that match the denylist (`.secrets/`, `*.tfstate*`, `*.pem`, …)
  are refused.
- **`HANDOFF.md` missing** → the script stops. Never hand off without context.
- **Target repo dirty / pull divergence** → script aborts; never clobber
  uncommitted target work, never auto-merge a handoff target.
- **HANDOFF.md lifecycle**: ONE live file at repo root, overwritten on each
  handoff; deleted (or folded into the PR/issue) when the workstream closes.
  Don't reference it from the ledgers, release notes or docs.

## Data-work caveat (statefulness)

Handoff does NOT migrate running data pipelines. If a backfill/incremental run
is mid-flight on the source, the protocol requires it to be quiesced at a
recorded checkpoint (or explicitly abandoned with the resume point recorded)
BEFORE seeding the box agent — never start a second concurrent writer against
the same target. The checkpoint lives in HANDOFF.md; the run never travels.
The box agent may prepare/validate but not write to an in-flight target unless
the fence says otherwise.

## Scope discipline

This skill is NOT deploy-agent, NOT a process/pane migration, NOT data
movement, NOT a multi-repo batch. Cross-machine `omp --resume=<path>` session
transfer is out of scope (session ≠ durable state; the git repo + committed
doc is the medium of record). Keep the handoff to the git + herdr mechanics
above.
