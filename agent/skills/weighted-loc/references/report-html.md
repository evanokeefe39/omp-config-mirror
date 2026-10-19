# HTML report format

A single-page, self-contained HTML report for readers **outside the repo** — a client,
an exec, a tech lead — who have no context. It is the same analysis as
`skill://weighted-loc/references/report-format.md`, rendered for comprehension rather
than for a terminal.

Produce it when the user asks for an HTML report, a shareable report, or a report "for
stakeholders". Write it to `.weighted-loc/last_report.html`.

## How to build it

1. Read `skill://weighted-loc/references/report-template.html` — it is the skeleton:
   tokens, styling and section structure are already correct. **Fill it in; do not
   restyle it.**
2. Replace every `{{PLACEHOLDER}}` (table below). Repeat the marked rows/blocks
   (`<!-- REPEAT: … -->`) once per item and delete the comment.
3. Compute the tier figure widths from the data, not by eye — each `{{Tn_SHARE}}` is
   that tier's share of weighted LOC, and the five widths sum to 100. Drop a tier's
   segment entirely when its share is 0 (a 0%-wide segment would still paint its 1px
   separator).
4. Write the file to `.weighted-loc/last_report.html` and open it to check it renders.

The Markdown report (`report-format.md`) and this one share one dataset. If both are
requested, produce both from the same numbers.

## Placeholders

| placeholder | value |
|---|---|
| `{{REPO}}` | repo name |
| `{{BRANCH}}` · `{{DATE}}` | branch the run measured · run date (YYYY-MM-DD) |
| `{{SUMMARY}}` | one paragraph of plain English: what the metric means + the headline result |
| `{{SCOPE}}` | what was measured and what was excluded (one line; tertiary text) |
| `{{RAW_LOC}}` · `{{WEIGHTED_LOC}}` · `{{EFFECTIVE_WEIGHT}}` | the three totals, thousands-separated (`3.46×`) |
| `{{FINDING_COUNT}}` · `{{FINDING_MIX}}` | finding count, and the severity mix (`2 high · 5 med · 2 low`) |
| `{{FIGURE_ARIA}}` | `aria-label` listing each tier's share, e.g. `Weighted LOC by tier: Tier 1 15.0%, …` |
| `{{T1_SHARE}}`…`{{T5_SHARE}}` | tier share of weighted LOC, numeric — the figure segment widths (sum = 100) |
| `{{T1_LABEL}}`…`{{T5_LABEL}}` | in-segment label, whole percent (`15%`) — keep ONLY when the share is ≥ 10 |
| `{{TIER_LABEL}}` · `{{TIER_MEANING}}` · `{{TIER_LINES}}` · `{{TIER_WEIGHTED}}` · `{{TIER_SHARE}}` | one tier row (`Tier 4 · 10×`, `fully custom`, …) — exactly five rows, in order 1..5 |
| `{{DEP_NAME}}` · `{{DEP_LINES}}` · `{{DEP_BREAKDOWN}}` | one dependency row |
| `{{F_WEIGHTED}}` · `{{F_LINES}}` · `{{F_TIER}}` · `{{F_PATH}}` | one file row, heaviest first |
| `{{SEV_CLASS}}` · `{{SEV_LABEL}}` | `high` / `med` / `low` and `HIGH` / `MED` / `LOW` |
| `{{FINDING_ID}}` · `{{FINDING_LOCATION}}` | `F-NNN` and `file :: symbol` |
| `{{FINDING_VIOLATES}}` · `{{FINDING_ISSUE}}` · `{{FINDING_SHOULD_BE}}` · `{{FINDING_IMPACT}}` | the four finding fields |

## The design system

The full token sheet is `skill://weighted-loc/references/report-design-system.md`
(Night Edition). The tokens are declared **once** in the template's `:root`, mapped
into the Tailwind theme, and used by name everywhere — **never inline a hex value or a
raw px.** The template already does this; keep it.

**Colour** — a near-black, warm-neutral ground (not blue-grey), paper-white ink in four
levels, **one** signature hue, and severity as the only other hues:

| token | role |
|---|---|
| `--ground` `--panel` | ground, and the one filled surface (metric strip cells) |
| `--rule` `--rule-strong` | hairline rules (the depth strategy — shadows are invisible on black) |
| `--ink` `--ink-2` `--ink-3` `--muted` | four text levels: primary, secondary, tertiary, chrome labels |
| `--brass` | the single signature colour — weighted LOC, the ramp top, per-finding savings |
| `--sev-high` `--sev-med` `--sev-low` | severity, and nothing else |
| `--tier-1` … `--tier-5` | one hue, five lightness steps — the figure's scale |

**Type** — one professional family, IBM Plex Sans, with IBM Plex Mono for machine
strings; system fallbacks behind both. A fixed scale, by token: `--fs-title` 30px/1.15 ·
`--fs-section` 13px · `--fs-lead` 15px/1.65 · `--fs-table` 13px · `--fs-label` 11px ·
`--fs-metric` 24px · `--fs-mono` 12px. No more than two families, no display weights.

**Space & shape** — a 4px base, Tailwind's default scale; sections separated by a
hairline rule with generous vertical rhythm (`--rhythm-section` + `--rhythm-pad`);
2px/4px/6px radii; a `--page-w` 920px column with a `--measure` 70ch prose cap. Depth is
borders, never shadows.

## Sections, in this order

1. **Header** — eyebrow, repo name, `branch · date`, then **one paragraph of plain
   English**: what the metric means, and the headline result. A scope line (what was
   measured / excluded, `--fs-table` in `--ink-3`), then a strip of four key metrics:
   Raw LOC · Weighted LOC · Effective weight · Findings. The Findings cell carries an
   11px `--muted` sub-line with the severity mix (`2 high · 5 med · 2 low`).
2. **Totals** — a three-row definition table (Term · Definition · Value): what each
   number means, not a repeat of the strip.
3. **By tier** — the one-sentence explanation of the weights (fixed at 1×/2×/5×/10×/20×;
   there is no 3× or 4×), the **figure**, then the table (tier · meaning · lines ·
   weighted · share). The table is the figure's legend — a 10px `--r-xs` swatch before
   each tier name; there is no separate legend.
4. **By dependency** — dependency · lines · tier breakdown.
5. **Top 10 weighted files** — weighted · lines · tier · path.
6. **Findings** — ranked by severity then weighted-LOC impact. Hairline-separated
   clauses, not cards: severity badge, id, `file :: symbol`, then Violates / Issue /
   Should be / Tier impact.

### The figure

One 100%-stacked horizontal bar, pure CSS flex — no chart library, no SVG. Five
segments in tier order, widths = the tier table's Share column. Track 18px, border 1px
`--rule-strong`, 1px `--ground` separators between segments. In-segment share labels
(whole %, `--fs-label`) **only when the share ≥ 10%** — below that they clip at 390px;
the table carries them. Labels use `--ink` on tiers 1–2 and `--ground` on tiers 3–5.
One axis caption row below: `Framework-leveraged` left, `Fully bespoke` right.
`role="img"` with an `aria-label` listing each tier's share.

## Rules

- **KISS / 80-20.** Every element carries information. No decorative subtitles, no
  gradients, no icons, no filler copy, no animation.
- **One figure, not a chart wall.** The stacked tier bar is the report's only visual
  idea; everything else is a table. No chart library — the figure is CSS.
- **Tokens, not literals.** If a value is not already a token, it does not belong in the
  report; add a token only by editing the template's `:root` and its theme mapping. The
  one literal is `<meta name="theme-color">`, which mirrors `--ground` because a meta tag
  cannot read a CSS custom property.
- **Long paths must not break layout** — the `.path` class wraps; keep it.
- **Machine strings are mono and untranslatable.** Paths, ids, the branch line and inline
  code spans use the mono classes and carry `translate="no"` so auto-translation cannot
  garble them; keep the attribute when you fill a value with inline `<span class="mono">`
  markup.
- **Self-contained.** One file. Tailwind and the fonts come from CDNs; nothing else is
  fetched, and no build step exists.
- **Responsive** — readable at 1280px and at 390px; the metric strip wraps to two
  columns, the finding field grid stacks below 640px, and the tier table tightens its
  cell padding so its five columns stay on one line per label.
