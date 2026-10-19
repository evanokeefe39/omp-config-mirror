---
description: "Pick a chart's form from what the terminal can render — a numeric markdown table is already charted in the main TUI session by tui.autoGraph, a bespoke chart goes out as SVG, and plain-text charting is only for output that must survive outside the TUI. An image is renderable here, so check the form before falling back to ASCII art."
alwaysApply: true
---

# Chart in a form the terminal can render

Three forms, in this order — take the first that carries the idea.

1. **Numeric markdown table.** The default, and in the main TUI session already a
   chart: `tui.autoGraph` (default `always`) draws one beneath numeric tables there, in
   theme colors; `smart` lets a judge model choose kind, scales, reference row and focus
   row. It is main-session only — subagent transcripts, print, RPC and ACP output stay
   plain, so a chart in those is a chart nobody draws. `off` suppresses it.
2. **A bespoke chart, as SVG.** In a reply, a ` ```svg ` block, where theme tokens
   (`currentColor`, `var(--fg)`, `--c1`…`--c6`) resolve. For a chart a library
   produced, write the file and read it as `read <file>.svg:img` — omp rasterizes SVG
   natively. Rasterization does **not** resolve theme tokens: a hand-written SVG bound
   for `read :img` renders blank with `currentColor` (measured 2026-10-12), so give it
   explicit colors.
3. **Plain text, only when it must leave the TUI** — a PR body, a CI log, a pasted
   log, a session with no graphics. `plotext` (**pin `<6`**; 6.x is a rewrite that
   drops `plot`/`scatter`/`date_form`), `asciichartpy`, `termgraph`. Emit it from a
   bash call, so the chart is real output rather than text typed into a reply.

Do not reach for ASCII art without checking the form: Kitty graphics and SIXEL frames
emitted by a command are decoded and displayed inline (both measured 2026-10-12). The
terminal is rarely the constraint — the destination is.

Probes for every path: `agent/scripts/fixtures/terminal-render/`.
