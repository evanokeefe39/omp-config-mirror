---
name: imp-kaizen
description: >
  Continuous improvement of systems, operations and the agent harness, by
  proposal. Invoke as "/imp-kaizen <subject>" — a retrospective, post mortem or
  improvement pass over the named subject (a workflow, project, agent, or
  incident). Reads the four ledger standards, measures deeper from session logs
  with DuckDB or grep, and ends in suggestions: kaizen proposes, the human
  disposes. Not for widening scope mid-task.
---

# imp-kaizen

The invoking prompt names the subject, and usually a hypothesis
(`/imp-kaizen the way we onboard sources seems inconsistent — surface issues`).
Work that subject. Test the hypothesis — do not set out to confirm it.

## What binds this — six properties from Toyota's practice

Sources: `artoflean.com/topics/kaizen` (Art Smalley, who worked inside Toyota);
Ohno, *Toyota Production System* (1978); Kato & Smalley, *Toyota Kaizen Methods*
(2011); and this harness's own
`~/.omp/agent/audits/harness-dark-factory-and-the-toyota-way.md`
(§3.3 jidoka, §6.5 standard work).

**Jidoka — stop at the abnormality; don't pass the defect on.** "Automation with
a human touch": the machine detects an abnormality and stops itself, or the
operator pulls the cord. Sakichi Toyoda's 1896 loom added a weft-breakage
auto-stop, because a loom that keeps weaving on a broken thread produces a whole
bolt of waste. *"Knowing when to stop is a skill."* When a pass finds a defect,
stop and fix it at the source instead of letting it propagate — nine boards
landing on a broken contract is not nine problems, it is one defect that was
allowed to run. Stopping is the cheapest moment to fix something, and the only
one where you still know what went wrong.

**Start from a standard.** *"Without standard work there is no kaizen."* Against
an unstandardized process there is no baseline, and so no way to tell whether a
change helped — the result is oscillation and the gains regress. The ledgers,
`WORKFLOWS.md` and the procedure skills *are* the standard here; a pass that
cannot name what it measured against has produced an opinion, not a finding.

**A countermeasure, not a containment.** Containment stops the bleeding; the
countermeasure removes the cause. The most common failure is stopping at the
former — patch, restart, move on — so the problem recurs. Say which one you have.

**An improvement isn't finished until the standard is updated.** Otherwise it
lives in one person's memory and the old method returns. The IMPROVEMENTS row and
the commit *are* the updated standard; "we'll do it differently now" is not.

**Yokoten — spread it sideways.** Solving a problem only where it was found is
incomplete work: the improvement is expected to reach every other place with the
same condition. The mechanism is the standard, not the write-up — an improvement
shared but never codified into a global rule, skill or agent spreads nowhere.
This harness has already paid for that lesson once, in the four-generation
ingestion drift.

**Judged by what was implemented, not by what was suggested.** Toyota measures
its suggestion system on ideas *adopted*, not filed: in one year ~43,000
employees submitted 250,000+ suggestions and **well over half were put in
place**, many approved on the spot by the group leader. The count is of changes
made. A retro that produces twenty recommendations and lands none scores zero —
and response speed is what sustains it, because a suggestion that gets no
reaction produces no next suggestion.

## 1 · Find the standard — or say there isn't one

Kaizen needs a baseline. Standards are recorded in three places here:

| standard | where |
|---|---|
| the four ledgers | `DEFECTS` · `IMPROVEMENTS` · `FEEDBACK` · `VERIFY` — global `~/.omp/agent/`, per project `<repo>/` |
| the intended workflow set | `~/.omp/agent/WORKFLOWS.md` |
| a procedure | `skills/*/SKILL.md`, `agents/*.md` |

**If no standard exists for the subject, that is the finding.** Much of this
harness is still being standardized, so this is the common case — and for an
unstandardized subject the move is not to invent a measurement, it is to report
"no standard yet" and propose the standard. `WORKFLOWS.md` records the workflows
we are *aiming* for, not a claim that each is automated: a subject listed there
but not implemented is a gap between intent and practice, which is reportable.

## 2 · Measure where the standard is silent

The ledgers hold what someone noticed; the transcripts hold what nobody did.

`~/.omp/agent/sessions/<project>/*.jsonl` — newline-delimited JSON.
`read_json_auto` to explore; once you know the keys, `read_json` with pinned
`columns` to iterate. Targeted text → built-in `grep`.

Shape (verified 2026-09-28): the payload nests under **`message`** —
`message.role` ∈ user/assistant/toolResult, `message.content[]` parts of `type`
text/toolCall/thinking, and a toolCall's tool name is **`name`**.

```bash
S="$HOME/.omp/agent/sessions"

# what the calls are spent on
duckdb -c "SELECT c.name AS tool, count(*) n
  FROM read_json_auto('$S/*/*.jsonl', union_by_name=true, ignore_errors=true) t,
       unnest(t.message.content) AS u(c)
  WHERE t.type='message' AND c.type='toolCall'
  GROUP BY 1 ORDER BY n DESC LIMIT 10"

# error-bearing results — the rework proxy
duckdb -c "SELECT count(*) AS results,
         count(*) FILTER (WHERE regexp_matches(to_json(t.message.content),
           '(?i)traceback|error|failed|exception')) AS error_bearing
  FROM read_json_auto('$S/*/*.jsonl', union_by_name=true, ignore_errors=true) t
  WHERE t.type='message' AND t.message.role='toolResult'"
```

State the caveats — error results include expected red tests; session wall-clock
includes user-away time and is not effort. An unqualified number is a claim, not
a measurement.

## 3 · Propose, then update the standard

Output is **suggestions**, labelled as such, each carrying: **what happened**
(evidence path) · **why** (root cause, not symptom) · **how to improve** (the
countermeasure) · **what goes red** if it were dropped.

Write the retrospective or post mortem itself as a long-form page under the owning
scope's `docs/retrospectives/` — `~/.omp/agent/docs/retrospectives/<date>-<subject>.md`
for the harness — and link it from the `details` cell of the rows it produces.

For whatever is then implemented, update the standard — the row and the commit
*are* the standard: `IMPROVEMENTS.md` (one row per cycle and per improvement),
`DEFECTS.md` (one row per instance; never edit a landed row), and `VERIFY.md`
only for a check that now exists and can be shown going red. Each ledger's row
format belongs to the operation that writes it — `imp-defect`, `imp-feedback`,
`imp-change`, `imp-verify` — never write one from memory. Scope and migration:
`skill://imp-setup`.

**Yokoten:** an improvement found in one project belongs back in the global
harness; one found in one agent belongs to its siblings. Name where each one
should land.

**Done when** the named subject is worked, the standard it was measured against
is named or its absence reported, every suggestion carries
what/why/how/goes-red, and everything implemented has a row and a commit.
Analysis written and nothing standardized is a report, not a kaizen.

**Companions** — this is the pass that reads the other four; each of them is the
operation you use once the pass has decided something:
`imp-defect` (record what broke) · `imp-feedback` (record what senses) ·
`imp-change` (record what changed) · `imp-verify` (record the guard) ·
`imp-standardize` (write the standard work a subject turned out to lack).
