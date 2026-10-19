# /imp-verify — say what proves it, and what would prove it wrong

Invoke the `imp-verify` skill: add or maintain a check in the `VERIFY.md` register
— `scope | stage | check | command | proves | doesn't prove | goes red | concurrency safe | expected runtime`
— writing `goes red` **before** the green. A check with no known failing case
proves nothing.

Run the skill now. Read `skill://imp-verify` first — it owns the row format. This
is a **register**, not a history: a check that is re-homed, renamed or retired has
its row **replaced**, because holding it append-only is how a stale row survives.
`imp-change` records the change a check arrived with.
