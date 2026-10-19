# Report Format

Output in this exact order:

## 1. File tree

```
/
├── / lines → weighted
│ ├── / lines → weighted
│ │ ├── lines → [3:280, 5:40]
│ │ └── ...
│ └── lines → [4:450, 1:50]
└── ...
```

Rules:
- `[tier:lines, tier:lines, ...]` after a leaf = per-tier line breakdown
- Directory lines = sum of all children
- Collapse with `...` when a directory has more children than
  `report.collapse_threshold` (5 by default), unless that directory is named by
  `--expand`
- `--expand <path>` is repeatable. `<path>` is a directory's path from the analysis
  root; `.` or `""` names the root. A path naming no directory expands nothing — a typo
  is a no-op, never a failure
- Sort children by weighted LOC descending

## 2. Totals

Raw LOC: N
Weighted LOC: N
Effective weight: N.N×

Blocks the judge did not answer: N of M (counted as tier 4)

Rules:
- The first three lines are always emitted, in this order.
- The fourth line is emitted **only when N is non-zero**. It names the blocks the judge
  returned no answer for; the classifier counts each as tier 4 at confidence 0, and tier
  4 is also a legitimate verdict, so without this line a report whose total rests on the
  fallback is indistinguishable from a complete one. `M` is the number of blocks
  classified. A healthy run omits the line — one reading `0 of M` on every report is
  noise that trains the reader to skip it.

## 3. By tier

The weight belongs to the tier, and it is **not the tier number**:

| tier | 1 | 2 | 3 | 4 | 5 |
|------|---|---|---|---|---|
| weight | 1× | 2× | 5× | 10× | 20× |

Emit exactly these five rows, in this order. There is no 3× and no 4× — a row reading
`Tier 4 (4×)` or `Tier 3 (3×)` is malformed.

Tier 1 (1×): N lines → N weighted (N%)
Tier 2 (2×): N lines → N weighted (N%)
Tier 3 (5×): N lines → N weighted (N%)
Tier 4 (10×): N lines → N weighted (N%)
Tier 5 (20×): N lines → N weighted (N%)

Percentages are of total weighted LOC.

Self-check before writing the report: every weight is one of 1, 2, 5, 10, 20, and
`weighted LOC = Σ(tier lines × tier weight)`. A weight outside that set means the report
is wrong — recompute it.

## 4. By dependency

<name>: N lines | tier 3: N | tier 2: N | tier 1: N
<name>: N lines | tier 2: N
custom: N lines | tier 5: N | tier 4: N | tier 2: N
<name>: researched YYYY-MM-DD from <basis> (N sources)
<name>: declared, no block credited

Rules:
- One row per dependency a block was credited to, heaviest by line count first.
- A declared dependency no block was credited to follows those rows, in declaration
  order, as `<name>: declared, no block credited`. This is the row that separates "no
  dependencies declared" from "dependencies declared, none of them used idiomatically" —
  the second is the finding worth surfacing, and without the row the two reports are
  identical.
- A dependency with a profile in `dep_profiles.yaml` gets one further row directly
  beneath its own, saying where that profile came from — a profile built from recall must
  never read like one built from evidence. The three cases must not read alike:

  ```
  fastapi: researched 2026-10-14 from registry+installed+agent (3 sources)
  fastapi: hand-written, no provenance recorded
  fastapi: recalled, no evidence gathered
  ```

  The first is a researched profile: `researched`, then the profile's `researched_at`
  date, then its `basis` printed verbatim, then the number of `sources` in parentheses —
  each part present only when the profile records it. The second records no `basis` at all
  — a human wrote it on purpose, so it is authoritative but not evidenced, and it says so.
  The third recorded `basis: recall`: nothing was gathered. A dependency with no profile
  entry gets no such row, and a run that wrote no profiles renders this section exactly as
  it did before profiles existed.
- The section is omitted **only** when the project declares no dependency *and* no block
  named one. A project that declares dependencies and uses none idiomatically still gets
  the heading, with only explanatory rows under it.

## 5. Top 10 weighted files

lines [tier:lines, ...] →

Rules:
- The heading is emitted verbatim, even when `report.top_files` is not 10: the numbered
  headings are part of the format, not a summary of the section's contents.
- At most `report.top_files` rows (10 by default), heaviest weighted LOC first, ties
  broken by path ascending.

## 6. Findings

Findings

F-001 [HIGH] core/operators/base.py :: MyBaseOp
Violates: False Abstraction
Issue: MyBaseOp(object) + subclasses re-implement retry + logging
Should be: @task(retries=3) — framework decorator covers both
Tier impact: 5 → should be 2 (saves 3,360 weighted LOC on 420 lines)

F-002 [MED] core/retry.py :: retry_with_backoff
Violates: False Abstraction
Issue: Hand-rolled retry with fixed sleep
Should be: tenacity library or framework-native retry config
Tier impact: 4 → should be 2 (saves 2,000 weighted LOC on 400 lines)

F-003 [MED] api/middleware/auth.py :: verify_token
Violates: Idiomatic pattern (FastAPI)
Issue: Manual token parsing + DB lookup per request
Should be: Depends(get_current_user) — framework DI convention
Tier impact: 3 → should be 2

F-004 [MED] pipeline/io_managers/s3_manager.py :: S3Manager
Violates: Convention (Dagster)
Issue: Custom S3 resource with manual bucket management
Should be: dagster-s3 package's S3Resource (community accepted)
Tier impact: 3 → should be 2

F-005 [MED] engine/scheduler.py :: (lines 1–38)
Violates: Best practice (comment conventions)
Issue: 38-line comment block explaining scheduler architecture
Should be: Move to docs/architecture.md or ADR-003
Tier impact: 5 → 0 (comments removed, content moved to docs)

### Finding format

| Field | Description |
|-------|-------------|
| ID | `F-NNN`, sequential per report |
| Severity | `HIGH` (tier impact ≥ 2 levels) / `MED` (tier impact 1 level) / `LOW` (no tier change, advisory) |
| File | Relative path |
| Block | Class or function name, or line range for comment blocks |
| Violates | One of: `False Abstraction` / `Idiomatic pattern (<framework>)` / `Convention (<framework>)` / `Industry standard (<standard>)` / `Best practice` / `Best practice (comment conventions)` / `Community accepted (<ecosystem>)` |
| Issue | One sentence: what the code actually does |
| Should be | One sentence: what the conventional/idiomatic approach is |
| Tier impact | `N → should be M (saves/adds X weighted LOC on Y lines)` |

### Rules
- Sort by severity (HIGH first), then by weighted LOC impact descending
- Only include findings where the fix would change the tier or reduce weighted LOC
  by ≥ 100. Skip purely stylistic nits.
- If a finding's "Should be" is uncertain or debatable, mark severity as `LOW`
  and prefix the "Should be" with "Consider:"
- Maximum 20 findings per report. If more exist, show top 20 and note
  "N additional findings omitted — re-run with `--all-findings` to see all."
