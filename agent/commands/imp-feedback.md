# /imp-feedback — catalogue what senses the system

Invoke the `imp-feedback` skill: add or read a sensor in the `FEEDBACK.md`
catalogue — `signal | where it lands | why / when it's useful | cadence` — naming
the failure it catches, and recording a plane that has **no** signal as a finding
rather than omitting it.

Run the skill now. Read `skill://imp-feedback` first — it owns the row format.
The other half of the loop is `imp-kaizen`, which reads this catalogue to find
which planes are blind.
