---
description: Publish only what is complete and audited — never ship-then-fix. Write where consumers don't read, audit, then publish atomically (Write-Audit-Publish). A partial or unverified result is never a deliverable.
alwaysApply: true
agents: ["data-*"]

---

# no-publish-then-fix

Never land a result that is incomplete or unverified and fix it later — a
consumer may already have read it.

- Write to a place consumers don't read, audit it against the quality contract,
  then publish only what passes (Write-Audit-Publish).
- A partial or unverified result is not a deliverable; it is a defect in the
  making.
- If a published thing is found wrong, treat the exposure as the problem, not
  just the fix.
