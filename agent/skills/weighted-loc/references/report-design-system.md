# HTML report — design system

The visual language for the `weighted-loc` HTML report
(`skill://weighted-loc/references/report-html.md`). One page, one direction:

> **Night Edition** — an audit letter's night edition. Charcoal paper, paper-white ink,
> one brass. A document a partner signed, not an app. Calm like a legal opinion, exact
> like an invoice. Nothing on the page is ornament: every hue is information, every rule
> separates content, every number is tabular.

The template (`report-template.html`) implements these tokens; the report uses them **by
name**. If a value is not a token here, it does not belong in the report.

## Colour

Warm-neutral near-black ground (not blue-grey), paper-white ink in four levels, **one**
signature hue (brass = the weight scale), and severity as the only other hues.

| token | value | role |
|---|---|---|
| `--ground` | `#0B0B0C` | page background |
| `--panel` | `#131315` | the only filled surface (metric-strip cells) |
| `--rule` | `#26262A` | hairline separators — section rules, table rows, strip gaps |
| `--rule-strong` | `#35353B` | the figure track border only |
| `--ink` | `#EEECE7` | primary text — values, headings (16.7:1) |
| `--ink-2` | `#B8B5AD` | secondary — body, table values, finding fields (9.6:1) |
| `--ink-3` | `#97948C` | tertiary content — de-emphasised columns, scope line (6.5:1) |
| `--muted` | `#85827A` | chrome labels and section lead-ins — metric labels, table headers, field names, section intro sentences (5.1:1) |
| `--brass` | `#D8A657` | **the one signature hue** = the weight scale: weighted-LOC value, ramp top, per-finding savings (8.9:1) |
| `--sev-high` | `#E5675E` | severity HIGH (6.0:1) |
| `--sev-med` | `var(--brass)` | severity MED — deliberately aliases brass |
| `--sev-low` | `#8A9099` | severity LOW — cool grey, no hue = no urgency (6.1:1) |

**Tier ramp** — one hue, five lightness steps; the page's only ramp:

| token | value | token | value |
|---|---|---|---|
| `--tier-1` | `#3B3427` | `--tier-4` | `#B99048` |
| `--tier-2` | `#5D4B2D` | `--tier-5` | `#D8A657` |
| `--tier-3` | `#96794A` | | |

Every text pairing is ≥4.5:1 (WCAG 2.1 relative luminance, computed); labels on the ramp
use `--ink` on tiers 1–2 and `--ground` on tiers 3–5.

## Type

One superfamily: **IBM Plex Sans** (report) + **IBM Plex Mono** (machine strings only —
paths, ids, branch). System fallbacks behind both. No display weights.

| token | size / line-height | weight | role |
|---|---|---|---|
| `--fs-title` | 30px / 1.15, ls -0.01em | 600 | report title (repo name) |
| `--fs-section` | 13px / 1.3, uppercase ls 0.1em, `--ink-2` | 600 | section heading |
| `--fs-lead` | 15px / 1.65, max 70ch | 400 | body / summary paragraph |
| `--fs-table` | 13px / 1.55, tabular | 400 | table cells, finding fields |
| `--fs-label` | 11px / 1.3, uppercase ls 0.08em, `--muted` | 500 | labels: metrics, headers, field names, eyebrow |
| `--fs-metric` | 24px / 1.1, tabular | 600 | key metric numbers (weighted LOC in `--brass`) |
| `--fs-mono` | 12px / 1.5, break-all | 400 | paths and ids |

## Space, shape, depth

- Base 4px; Tailwind's default scale used as-is.
- `--rhythm-section: 56px` margin + 1px rule + `--rhythm-pad: 32px` padding between sections (88px).
- `--page-w: 920px` single left-aligned column; `--measure: 70ch` prose cap; `--figure-h: 18px`; `--finding-label-w: 88px` (finding field names); `--swatch: 10px` (tier-table swatches).
- Radii: `--r-xs: 2px` (swatches) · `--r-sm: 4px` (badges, figure track) · `--r-md: 6px` (metric strip).
- **Depth is borders, never shadows.** No `box-shadow`, no `backdrop-filter`, no gradients
  — invisible on black and pure noise. Filled surfaces: `--panel`, badge tints
  (`color-mix(in srgb, <sev> 14%, transparent)`), and the figure segments only.

## The one figure

A single 100%-stacked horizontal segment bar — pure CSS flex, no chart library, no SVG.
Five segments in tier order, widths = the tier table's own Share column. Track 18px,
border 1px `--rule-strong`, 1px `--ground` separators between segments. In-segment share
labels (whole %, `--fs-label`) **only when share ≥10%** (below that they clip at 390px; the table carries them). One axis caption
row below: `Framework-leveraged` left, `Fully bespoke` right — the client's own question.
**No separate legend** — the tier table is the legend (a 10px `--r-xs` swatch before each
tier name). `role="img"` with an `aria-label` listing each tier's share.

## Rules

- **One accent, one figure.** Brass is the only signature hue; the tier ramp is five steps
  of it. Exactly one non-table visual in the whole report.
- **No decoration.** No icons, gradients, motion, shadows, ornament numbering, or filler
  copy. The severity badge spells HIGH/MED/LOW — no glyphs.
- **Tokens, not literals.** No inline hex, no magic px. Theme-map the tokens in
  `tailwind.config` and use the semantic class.
- **Findings are clauses, not cards** — hairline-separated entries, not a boxed grid.
- **Long paths wrap** (`--fs-mono` + `break-all` + `min-w-0` on the cell).
- **Responsive** — 390px: strip 2×2, finding grid stacks, tables wrap; 1280px: 920px column.

## Rejected defaults

AI-purple on zinc-950 → warm charcoal + brass · Inter + slate-900 → Plex Sans/Mono ·
card-grid → hairline clauses · glassmorphism → none · pill badges → 14% tinted ·
gradients → none · icon clutter → words · chart wall → one figure + tables ·
zebra/hover/animation → static document · shadow depth → borders · giant hero digits →
24px tabular metrics · decorative section numbers → plain labels · centred hero →
left-aligned column.
