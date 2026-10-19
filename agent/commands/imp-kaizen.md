# /imp-kaizen — continuous improvement, by proposal

Invoke the `imp-kaizen` skill, naming the subject and any hypothesis:
`/imp-kaizen the way we onboard sources seems inconsistent — surface issues`.

The skill carries the procedure: find the standard the subject is measured
against (the four ledgers, `WORKFLOWS.md`, a standard-work skill) **or report that
there isn't one yet** — much of this harness is still being standardized, and for
an unstandardized subject the deliverable is the standard, not an improvement
claim. Then measure deeper from session logs (DuckDB `read_json_auto` to explore,
`read_json` with pinned columns to iterate, `grep` for targeted text), and end in
labelled suggestions — what happened, why, how, what goes red.

Run the skill now. Read `skill://imp-kaizen` first; it carries the Toyota origin
and the six properties that constrain the pass. Companions: `imp-defect`,
`imp-feedback`, `imp-change`, `imp-standardize`.
