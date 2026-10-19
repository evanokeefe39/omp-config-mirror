---
name: dnd-edu-sim
description: >
  Conventions and workflow for the education-sim simulator — a DnD-style
  school observation simulator (character sheets + event timelines in, raw
  grades and attendance observations out). Use when working in the
  education-sim repo (running simulations, adding status effects or
  character sheets, calibrating against the acceptance contract, planning
  scenarios), or when using the installed education-sim package
  (CLI or Python API) from another project.
---

# dnd-edu-sim

A school observation simulator with tabletop-RPG mechanics. Students are
character sheets; life events are status effects with start and end dates;
every grade and every school day is a dice roll modified by stats and active
effects. Output is flat observation tables. The sim **never aggregates** — no
averages, no z-scores, no alerts. Statistics live in tests and downstream
tools.

## Using the installed package (from any project)

The sim is a pip-installable package with a console-script CLI, so you can
run it and pull raw observations out of any project. The skill itself is
also installable globally (see below).

### Install

```bash
# In the project where you want to use it (uv):
uv add "education-sim[cli] @ git+https://github.com/evanokeefe39/education-sim.git"

# From a local checkout instead of git:
uv add "education-sim[cli] @ /path/to/education-sim"
```

The bare package (no `[cli]`) is the stdlib-only core plus the `export`
writers — enough to run the sim and dump tables. The `[cli]` extra adds the
PyYAML-backed experiment runner and the `dnd-edu-sim` command.

### Run the CLI

```bash
dnd-edu-sim run --input experiment-1 --seed 42
```

Reads `experiment-1/config.yaml` + `validation.yaml` → builds data →
simulates → writes `.runs/experiment-1/<seed>_<ts>/run.json` and
`output/*.csv` (all 8 observation tables). Point `--input` at an experiment
dir from anywhere; outputs land next to it in `.runs/`. In the repo,
`uv run python -m education_sim run --input experiment-1 --seed 42`
is the equivalent. `dnd-edu-sim --version` prints the installed version.

### Run from Python and get data out (no extra needed)

```python
from education_sim import build_data, simulate
from education_sim.export import write_outputs, write_json

data = build_data(data_seed=0, story_events=True,
                  background_counts={"illness": 6, "exam_anxiety": 2,
                                     "parents_divorce": 1},
                  condition_rates={"undiagnosed_adhd": 0.07})
result = simulate(data, seed=42)        # dict[str, list[tuple]]
write_outputs("out", result)            # out/output/*.csv (all 8 tables)
write_json("out/tables.json", result)   # one JSON object; dates as ISO strings
```

The sim never aggregates — aggregate downstream (pandas, DuckDB, your tests).

### Install the skill globally (so agents know this workflow)

```bash
# from the education-sim checkout:
uv run scripts/install.py skill        # → ~/.omp/skills/dnd-edu-sim/ (every project)
uv run scripts/install.py all          # skill + package into the current env
uv run scripts/install.py check        # report where things are installed
```

The rest of this file is repo-internal convention. If you are not working in
the education-sim repo, the sections above are all you need.

## Orientation (inside the repo — do this first in any session)

1. Read `docs/user-stories.md` (who it's for + the reference story roster).
2. Read `docs/definition-of-done.md` (the acceptance contract — this is the spec).
3. Read `docs/tech-requirements.md` (the roll model, calibration dials, v1 scope).
4. Read the current plan: `tasks/plans/v1-effects-cohorts-events.md`.
5. `docs/status-effects.md` and `docs/character-sheets.md` are the catalogs.
6. `docs/phase-e-ac-calibration.md` records the 2026-08-10 AC recalibration.

## Current status

**Phases A–F complete — 210 tests, all green.** Core pipeline
(`build_data()` → `simulate()` → test-side `find_triggers()`) with the full
story layer: 14-effect registry, cohort builder, scripted + background event
scheduling, persistent conditions, interventions, and the AC1–AC8 acceptance
suite across seeds {42, 7, 2024}. See `tasks/plans/v1-effects-cohorts-events.md`
for the as-built record of each phase.

## Standing rules

- **Emergence over scripting.** Stories live in initial data (sheets +
  event timelines), never in code. Never special-case a story student.
- **Never aggregate inside the sim.** Test-side harnesses may aggregate
  freely; the core may not.
- **Determinism is sacred.** One seeded RNG stream, fixed draw order:
  names → stats → conditions → background events → scripted →
  interventions, then attendance per student per day (student id order),
  then grades per assessment (assessment id order, student id order). Any
  draw-order change is a breaking change.
- **Thresholds change only in `docs/definition-of-done.md`**, with the reason
  recorded — never weakened to force a test pass. The 2026-08-10 rationale
  entry and `docs/phase-e-ac-calibration.md` show the process.
- **Calibration levers** (base_dice, TYPE_WEIGHTS, DEFAULT_OFFSET,
  ATTEND_DC_BASE, STAT_WEIGHTS, trigger thresholds, background counts,
  condition rates) are the intended knobs. Tune them; don't special-case.
- Python stdlib-only core, `uv` for tooling (never pip), pytest for the
  contract suite. PyYAML is an **optional** dependency (the `cli` extra)
  for the experiment-runner tooling (`run.py`/`config.py`) — never imported
  by the core; the bare install plus the `export` writers are stdlib-only.

## Common tasks

### Run the pipeline

```python
from education_sim.school import build_data
from education_sim.simulate import simulate

data = build_data(data_seed=0, story_events=True,
                  background_counts={"illness": 6, "exam_anxiety": 2,
                                     "parents_divorce": 1},
                  condition_rates={"undiagnosed_adhd": 0.07})
result = simulate(data, seed=42)
# result["grades"], result["attendance"], etc.
```

### Run an experiment (Phase F)

```bash
dnd-edu-sim run --input experiment-1 --seed 42
# in-repo equivalent: uv run python -m education_sim run --input experiment-1 --seed 42
```

Reads `experiment-1/config.yaml` + `validation.yaml` → builds data →
simulates → writes `.runs/experiment-1/42_<timestamp>/run.json` and
`output/*.csv` (all 8 observation tables). The CLI is the tooling entry
point; scenario authors edit YAML, not Python.

### Add a status effect

1. Add the effect to the catalog in `docs/status-effects.md`.
2. Implement the effect definition in `EFFECTS` in
   `src/education_sim/effects.py` (key → tier → modifier dict:
   `int_mod`, `dil_mod`, `attn_dc`, `on_types`, `on_subject`,
   `reason_factors`, `replaces`, `scope`, optional `affinity_mod`).
3. If it's in the background pool, add its tier weights to `TIER_WEIGHTS`.
4. Validate: run the effect in isolation (see `tests/test_b3_gates.py`
   for the per-effect gate pattern), confirm the expected signal.
5. Regression gate: students with no active effects must match Phase A
   baselines (`test_b3_regression_phase_a_baselines`).

### Author a story

1. Define the story in `docs/user-stories.md` reference roster.
2. Add the character sheet to `STORY_SHEET_SPECS` in `school.py` (id 9001+,
   stats, affinities, label).
3. Add the event timeline to `SCRIPTED_TIMELINE` (student-scoped) or
   `SCRIPTED_CLASS_EVENTS` (class-scoped) in `events.py`.
4. Add the emergence clause to `docs/definition-of-done.md` AC1 — and if
   the threshold is uncertain, measure first and record rationale per the
   meta-rule (see the 2026-08-10 panel process).

### Author a scenario (experiment dirs)

Inputs live in an experiment directory. Outputs land in `.runs/`.

#### Experiment layout

```
experiment-1/                          # Inputs — stable, versioned
├── summary.md                         # What we're exploring
├── config.yaml                        # Sim dials: cohorts, stories, effects,
│                                      #   base_dice, offsets, weights, seeds
├── validation.yaml                    # Judge dials: trigger_drop,
│                                      #   trigger_baseline, G1 sd cap
├── students.generated.csv             # Raw cohort builder output
├── students.csv                       # Authoritative (hand-edited copy)
└── timeline.csv                       # Scheduled effects (dated only)
```

#### config.yaml schema

```yaml
run_id: "example"
description: "what we're exploring"

school:
  year_level: 10
  subjects: [English, Mathematics, Science, Humanities, Health & PE]

sim:
  data_seed: 0
  sim_seeds: [42, 7, 2024]
  base_dice: 5
  background_event_rate: 0.05

cohorts:
  average: 100
  hard_worker: 20

stories:
  - id: 9001
    label: divorce_arc
    name: Amelia
    stats: {INT: 3, DIL: 2, SOC: 1, COM: 1}
    affinities: {English: 1, Mathematics: -1, Humanities: 2}

effects:
  scripted:
    - target: 9001
      effect: parents_divorce
      start: 2025-04-21
      end: 2025-09-19

  interventions:
    - target: 9003
      effect: adhd_medicated
      start: 2025-07-14

  conditions:
    undiagnosed_adhd: 0.07   # flat {key: fraction} — see apply_conditions()

  background:
    illness: 6
    exam_anxiety: 2
    parents_divorce: 1
```

Keys are schema-guarded by `src/education_sim/config.py` — an unknown
key raises ValueError rather than silently defaulting. Effect modifiers
live in the registry (`effects.py`), not in config; config only schedules
events with `target`, `effect`, `start`, `end`.

#### validation.yaml schema

```yaml
trigger:
  drop_threshold: 2.5
  baseline_threshold: 1.0

gates:
  g1_sd_cap: 16
```

#### Run layout

```
.runs/
└── experiment-1/                      # Outputs — per seed, per timestamp
    ├── 42_2026-08-08T143000/
    │   ├── run.json                   # {seed, timestamp, sim_version, input_path}
    │   └── output/                    # Raw sim observation tables
    │       ├── grades.csv
    │       ├── attendance.csv
    │       ├── sheets.csv
    │       ├── assessments.csv
    │       └── events.csv
    ├── 7_2026-08-08T143001/
    └── 2024_2026-08-08T143002/
```

#### Key conventions

- **Inputs are stable.** The experiment directory holds the authoritative
  student list, timeline, and dials. Re-used across all seeds. Versioned
  with git.
- **`.runs/` is pure results.** Gitignored. Each run is `<seed>_<timestamp>`.
  Re-run the same seed after a calibration change, get a new timestamped
  directory alongside the old one.
- **Config follows the sim/judge split.** `config.yaml` holds sim dials
  (base_dice, offsets, weights — changes output). `validation.yaml` holds
  judge dials (trigger thresholds, sd caps — changes judgment, not output).
- **students.csv is the truth.** `students.generated.csv` is the cohort
  builder's raw output. Copy to `students.csv` and hand-edit. The generator
  never overwrites `students.csv`. A `condition` column carries persistent
  conditions (e.g. `undiagnosed_adhd`) — editing it changes the condition.
- **timeline.csv carries dated effects only.** Conditions are materialized in
  `students.csv`'s condition column, not in the timeline.
- **run.json is provenance.** `{seed, timestamp, sim_version, input_path}` —
  enough to reconstruct what ran.

### Calibrate

Run the full contract suite (`uv run pytest tests/`) across seeds {42, 7,
2024}. Adjust calibration levers, not thresholds. AC7 (zero events → zero
triggers) is the noise-floor proof — if it fails, the dice are too loud, not
the stories too quiet. If a threshold genuinely can't be met, follow the
2026-08-10 process: measure across seeds, get panel consensus, record the
rationale in `docs/definition-of-done.md` and the panel doc — never weaken
the test in place.

**Cohort conditionality (measured 2026-08-10, `docs/phase-h-analysis-review.md`):**
AC thresholds are calibrated on the **flat cohort** (no `cohorts:` key).
The single RNG stream means dice counts vary with each student's effective
stat and chain-days skip draws, so a `cohort_spec` shifts every story
student's absolute grades. Same seed, different background → different
story readings: the archetype cohort passes each AC1 clause on 34–39 of
40 seeds (vs 38–40/40 flat) and can produce sub-threshold single-seed
readings (e.g. divorce 11.7 < 13 on seed 2024) and seed 42 with zero story
triggers. Signals emerge reliably on both; per-seed clause checks are
scenario-relative — compare within a cohort, not across.

## Module map

| Module | What it does |
|---|---|
| `dice.py` | `advantage_roll()` — the core RNG primitive |
| `grade.py` | `grade()` — weighted INT/DIL by assessment type |
| `attendance.py` | `daily_attendance()` — d20+SOC check, reason table, chain days |
| `calendar.py` | `school_days()`, `term_of()` |
| `stats.py` | `draw_stat()`, `draw_affinities()` |
| `tables.py` | row builders — flat tuple schema |
| `school.py` | `build_data()` → `SimData`, `build_cohort()`, story sheets |
| `simulate.py` | `simulate(SimData, seed)` → observation tables |
| `effects.py` | `EFFECTS` registry, `PERSISTENT_CONDITIONS`, `resolve_effects()` |
| `events.py` | `scripted_events()`, `background_events()`, `apply_conditions()`, `intervention_events()`, `resolve_weakest_subject()` |
| `constants.py` | `TYPE_WEIGHTS`, `DEFAULT_OFFSET`, `STAT_WEIGHTS`, `ARCHETYPES` |
| `run.py` | `dnd-edu-sim` CLI + `run_experiment()` + run.json provenance |
| `config.py` | PyYAML loaders with schema guards (`cli` extra) |
| `export.py` | `write_outputs()`/`write_json()` — stdlib-only table writers |
| `__main__.py` | `python -m education_sim` entry → the CLI |

Test-side:
| `tests/trigger_rule.py` | `find_triggers()` — the judge (2.5 SD drop, +1.0 baseline) |
| `tests/test_gates.py` | G1 (sd ≤ 16), G3 (zero triggers), G4 (population spread) |
| `tests/test_acceptance.py` | AC1–AC8 contract suite across seeds {42, 7, 2024} |
| `tests/test_effects.py` | resolve_effects unit tests + smoke |
| `tests/test_events.py` | scripted/background/conditions/interventions |
| `tests/test_cohorts.py` | archetype builder |
| `tests/test_b3_gates.py` | per-effect isolation gates (seed 42) |
| `tests/test_run.py` | config loading, CSV output, run_experiment |

## Gotchas

- The trigger rule (`find_triggers`) lives in `tests/`, NOT in `src/`. The
  sim never computes a z-score or checks for a decline.
- `build_data()` defaults to **zero events** (the AC7 negative-control path).
  The realistic scenario is opt-in: `story_events=True`,
  `background_counts=...`, `condition_rates=...`.
- `resolve_effects` returns a 5-tuple: `(int_mod, dil_mod, attn_dc,
  reason_factors, affinity_deltas)` — `affinity_deltas` carries per-subject
  affinity mods (e.g. sports_commitment's Health & PE +1).
- Sheet tuples are 7 fields: `(id, INT, DIL, SOC, COM, affinities,
  conditions)`. Event tuples are 8 fields: `(target_type, target, key,
  start, end, source, tier, on_subject)`.
- Scripted sheet ids live in the 9001+ range; background ids below it.
- `moved_school_arc` was removed from the story roster — not an arc we want.
- `uv` for Python tooling; never pip. `.venv` in project root.
- No PowerShell. Bash for terminal commands.
