# /imp-defect — record a defect, one row per instance

Invoke the `imp-defect` skill: stop at the abnormality, then append **one row per
instance** to the append-only `DEFECTS.md` ledger at the scope that owns it —
never merged, never reopened, `evidence` always a path or a runnable command.

Run the skill now. Read `skill://imp-defect` first — it owns the row format.
Scope and migration are `skill://imp-setup`. If you are also fixing it, that
half is `imp-change`.
