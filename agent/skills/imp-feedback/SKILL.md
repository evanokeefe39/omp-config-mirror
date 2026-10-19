---
name: imp-feedback
description: >
  Add or read a sensor in the FEEDBACK catalogue — what signal exists, where it
  lands, why it is useful, how often it fires. Use when adding instrumentation,
  or when asking whether a failure mode is observable at all.
---

# imp-feedback — catalogue what senses the system

A guarantee you cannot observe is not a guarantee. Toyota's andon only works
because someone sees it — and a dashboard nobody reads is not a sensor, it is a
light that was left on. This catalogue records the sensors that earn their place.

## Run it when

- you add instrumentation: a log, a marker, a metric, a report, a check
- a failure mode went undetected and you are asking **what would have seen it**
- you are running `imp-kaizen` and need to know which planes are blind
- you are about to build a sensor and want to know whether one already exists

## You need first

**The plane the sensor observes.** Three exist, and all three need coverage —
recording one plane and omitting the others reads as covered when it is not:

1. the **system** being built — pipelines, documents, assets
2. the **harness** — which skills fire, rule adherence, defect-capture rate, cost
3. where output **lands** — production incidents, reader or client feedback, rejection

**And the lifecycle stages the scope declares** — the line at the top of
`FEEDBACK.md`. Coverage is two-dimensional: every plane **at every stage**. The
stages are the domain's (research → design → develop → test → CI → CD → monitor
for software; brief → capture → edit → master → release for media), and they are
named rather than assumed so that a stage with no sensor is the finding this
catalogue exists to make visible.

## Steps

1. **Name the failure the sensor would catch.** A sensor with no named failure is
   decoration, and decoration spends attention without buying anything.
2. **Append one row, four columns** —
   `signal | where it lands | why / when it's useful | cadence`.
   `cadence` is how often it fires or is read; `where it lands` is a real path,
   endpoint or command.
3. **Record the gaps too.** A plane with no signal is a finding worth a row; the
   catalogue is not a list of what is already handled.
4. **If the signal is a check that can pass or fail**, it also earns a `VERIFY.md`
   row — record that through `imp-verify`, with its `goes red` case.

**This catalogue is a register, not a history** — it states what senses the scope
*now*. A sensor that is retired or superseded has its row replaced, because a
stale row is a claim about the system that is no longer true. `DEFECTS.md` and
`IMPROVEMENTS.md` are the opposite: append-only histories, one row per instance.

## Done when

The row names a failure the sensor would catch and the failure it would miss, and
`where it lands` resolves. A sensor row that names no failure has not told a
reader when to trust it.

## Where it lands

`FEEDBACK.md` at the owning scope — global harness or project, **one catalogue per
scope**. **This skill owns the row format** — the four columns above are the
definition; `skill://imp-setup` owns scope and migration. Sibling operations:
`imp-defect` (what broke), `imp-change` (what changed), `imp-verify` (what proves it),
`imp-kaizen` (the pass that
reads all of them).
