# HANDOFF.md — handoff summary template

Copy this into `HANDOFF.md` at the repo root. Every section is required where
applicable; "Explicitly NO" items are never allowed. The receiving agent's
step 0 is to read this, pin to the recorded SHA, and independently re-verify
the "last completed step" before doing any new work.

---

## Goal

One paragraph: what outcome this workstream is driving, and for whom.

## Definition of done

A checklist of externally checkable criteria. Each item: "done when `<command>`
prints/returns `<expected>`."

- [ ] done when `command` → expected
- [ ] done when `command` → expected

## Current state

- **Branch**: `<branch>` (receiver: `git fetch && git checkout <SHA>`)
- **Pinned SHA**: `<full 40-char sha>` (from `git rev-parse HEAD`)
- **Last completed step**: `<what was finished>` — verify via:
  `command`
- **Dirty/clean**: `<clean | list what is uncommitted>`

## Next steps

Ordered, actionable. Each carries its own acceptance check.

1. `<step>` — done when `command` → expected
2. `<step>` — done when `command` → expected

## Key files

Repo-relative paths only, with why each matters.

- `path/to/file` — why it matters

## Decisions made & constraints discovered

The "why", not just the "what". Any decision that lives only in this session
MUST be written down verbatim (it is the contract of record for the handoff).

## Open questions / risks / how to verify

- Risk / open question — how to verify / what's needed

## Data state  (REQUIRED if the workstream touches data)

- **Read sources**: logical names + freshness/watermark at handoff time.
- **Write targets**: logical names + schema/contract version.
- **Invalidation blast radius**: every downstream consumer (derived tables,
  dashboards, alerts) and the invalidation plan per consumer.
- **In-flight run state**: is a backfill/incremental run mid-flight? Stopped+
  checkpointed (offset/run id recorded) or abandoned (resume point recorded).
  Fence: may the box agent write to in-flight targets? (specify)
- **Verbatim data contracts**: column semantics, dedup rules, derivation
  logic that exist only in-session — written down, not summarized.
## Data handoff (object storage)  (REQUIRED if any gitignored data travels)

For each gitignored dir the target needs, the bucket + prefix (from the
`--data` run) and the local target path. Source is authoritative (mirror).

- `data/`  →  `s3://<bucket>/handoff/<repo>/data`  (target: `~/repos/<repo>/data`)
- `media/` →  `s3://<bucket>/handoff/<repo>/media` (target: `~/repos/<repo>/media`)

## Explicitly NO (never in this file)

- Secrets, API keys, connection strings, hosts/ports/creds — reference by
  logical name only.
- Absolute paths (`/home/<user>/`), hostnames, usernames that differ across
  hosts — repo-relative paths only.
- Sample data rows from production (PII/PHI) — synthetic examples only.
- Raw transcript dumps / whole-log dumps — curated summary only.
