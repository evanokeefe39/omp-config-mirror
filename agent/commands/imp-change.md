# /imp-change — record a change so it survives

Invoke the `imp-change` skill: append the `IMPROVEMENTS.md` row naming **the file
changed** (not just "fixed") and its `status`, and commit it.

Run the skill now. Read `skill://imp-change` first — it owns the row format. State
whether the fix was containment or a countermeasure — and if containment, what the
countermeasure would be. If the change also added a check, that half is
`/imp-verify`, which owns the `VERIFY.md` row.
