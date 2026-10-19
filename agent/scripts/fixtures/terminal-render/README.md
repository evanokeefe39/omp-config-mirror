# Terminal rendering probes

Six capabilities, one probe each: the exact prompt to paste, what the terminal should
show, and the red case that proves the check can fail. The rule these probes back is
`rule://terminal-charting`.

Every probe is marked `machine-observed` (the proof is in the tool result — a content
type, a returned payload, an error string — so a session can read it) or
`human-observed` (the proof is the TUI painting pixels, which the answering session
cannot see).

## Probes

| # | capability | prompt | expect | red case | observed |
|---|---|---|---|---|---|
| 1 | numeric table auto-charted | Search the web for the 10 largest countries by population and give me a table with population, annual growth rate and median age. | a table plus a chart drawn beneath it in theme colors | set `tui.autoGraph: off` (session-only, `cfg://tui/autoGraph`) and repeat → table, no chart | human-observed |
| 2 | inline ```svg block | Draw a ```svg block: a 320x160 line chart of 14,13,18,21,19,16,22,25,24,20 with the line in var(--c1) and axis labels. | an inline image, line in the theme's first series color | launch omp with `PI_FORCE_IMAGE_PROTOCOL=none` → the block shows as text | human-observed |
| 3 | SVG file rasterized | Write a matplotlib line chart to <temp>/probe.svg and read it with :img | inline image | `read agent/scripts/fixtures/terminal-render/blank.svg:img` → blank image | machine-observed |
| 4 | mermaid → terminal ASCII | Draw a ```mermaid sequence diagram of a GitHub Actions release job: checkout, test, release-please PR, merge, tag. | an ASCII/Unicode diagram in the terminal | a mermaid block with a syntax error renders as an error, not a diagram | human-observed |
| 5 | image emitted by a command | Run uv run --with pillow python agent/scripts/fixtures/terminal-render/kitty_frame.py and show me the result. (or the SIXEL `printf` one-liner) | the bar chart appears inline | emit a frame with a payload that is not a PNG → no image (`TEXT`) | machine-observed |
| 6 | plain-text chart | Use plotext (pin <6) in a bash call to plot 30 daily values and show the chart. (fixture: `text_chart.py`) | a braille chart in the tool result | `uv run --with 'plotext>=6' ...` → `AttributeError` | machine-observed |

Probes 1, 2 and 4 are `human-observed`: the model cannot see its own render, so the
only proof that a chart, an inline image or a mermaid diagram was *painted* is a person
looking at the terminal. Probe 3 is machine-observed because `read :img` returns an
image content block; probe 5 because a headless child session answers `IMAGE` or `TEXT`
for the frame; probe 6 because the braille text and the `AttributeError` both land in
the tool result verbatim.

## Evidence (2026-10-12)

Measured on this machine, Windows Terminal, omp 18.x:

- A Kitty graphics frame (`ESC_Gf=100,a=T,m=0;<base64 PNG>ESC\`) printed from the bash
  tool renders inline as an image. A raw SIXEL frame
  (`printf '\x1bPq#0;2;0;0;100#0~~~~~~~~~~~~~~\x1b\\\n'`) also renders inline.
- Differential, headless child session (`omp -p --no-session`), asking the child whether
  its tool result contained an image: valid PNG payload → `IMAGE`; invalid payload
  (`bm90LWEtcG5nIQ==` = "not-a-png!") → `TEXT`. The red case is observable.
- `PI_FORCE_IMAGE_PROTOCOL=none` set only in the *child* environment changed nothing —
  extraction is unconditional; the variable matters at session start.
- `read <file>.svg:img` rasterizes natively (a matplotlib SVG read back as
  `image/png`; `chart.svg` here came back as an inline image block typed
  `image/webp` on 2026-10-12); `read <file>.png` returns an inline image block.
- A hand-written SVG whose stroke/fill is `currentColor` renders **blank** through
  `read :img` — rasterization does not resolve theme tokens.
- `uv run --with 'plotext<6'` prints a braille line chart into tool output.
  `uv run --with 'plotext>=6'` fails:
  `AttributeError: module 'plotext' has no attribute 'date_form'` (6.1.0 is an API
  rewrite).
- `tui.autoGraph` reads `always` (default) in this session: `cfg://tui/autoGraph`. It
  applies to the **main TUI session only** — subagent transcripts, print, RPC and ACP
  output stay plain, and their prompts omit the chart guidance (`omp://settings.md:870`)
  — so probe 1 has to be run in the main session, not through a subagent.
- omp facts: `tui.autoGraph` charts numeric tables in the agent's answers
  (`omp://settings.md:870`); natives include `svg` rasterization and
  `renderMermaidAscii` (`omp://natives-architecture.md:46`,
  `omp://natives-binding-contract.md:40`); Kitty/SIXEL discovery and `ImageBudget`
  (`omp://tui-core-renderer.md:154,249`); bash extracts Kitty/SIXEL frames as image
  content (`omp://bash-tool-runtime.md:236`).

## Running the fixtures

Graphics frame (Kitty — writes the PNG to the system temp dir, never the repo):

```
uv run --with pillow python agent/scripts/fixtures/terminal-render/kitty_frame.py
```

Bare SIXEL frame, no dependency:

```
printf '\x1bPq#0;2;0;0;100#0~~~~~~~~~~~~~~\x1b\\\n'
```

Plain text (pin plotext `<6`):

```
uv run --with 'plotext<6' --with asciichartpy python agent/scripts/fixtures/terminal-render/text_chart.py
```

The same command with `--with 'plotext>=6'` is the red case: `AttributeError: module
'plotext' has no attribute 'date_form'`.

SVG rasterization — `chart.svg` carries explicit colors and renders; `blank.svg` uses
`currentColor` and comes out blank:

```
read agent/scripts/fixtures/terminal-render/chart.svg:img
read agent/scripts/fixtures/terminal-render/blank.svg:img
```
