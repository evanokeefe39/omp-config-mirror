---
name: design-ecosystem
description: >
  Industry-standard map of the DESIGN-ASSET / COMPONENT-LIBRARY / ANIMATION /
  MOTION ecosystem, and how to navigate it. Use when deciding what to reach for
  (component library vs headless primitive vs native control; Motion vs GSAP vs
  hand-rolled CSS), where to source proven effects and components, what the
  licensing gates are, and how far to push "industry standard" on a given
  surface without over-engineering. Complements interface-design (token/control
  architecture), hue (design-language), scroll-craft (scroll-driven), and
  ui-ux-pro-max (reference data). Not itself a design language — it is the
  navigation layer between a concern and the mature tool/source that solves it.
---

# design-ecosystem — navigating the design-asset, component, and motion landscape

This skill exists so a UI/UX agent does not guess or over-build. It codifies:
what the industry-standard pieces are, which to reach for at which rung of
complexity, where to source proven work (examples, registries, MCP), the license
gates that actually bite, and the discipline that keeps "industry standard"
from becoming "industry bloat." Treat the URLs as a live map — the ecosystem
moves; re-verify before quoting specifics, and date any recommendation you make.

## 1. The core principle: reach for maturity, not novelty; weight, not default

A library is justified only when it moves you up the ladder below AND earns its
weight. Never adopt a tool because it is fashionable or "what pros use" —
adopt it because the current rung is demonstrably costing you correctness,
accessibility, or time. State the rung you are on before you reach for a tool.

## 2. Component-layer ladder (from least to most machinery)

Decide the rung first; the tool follows from the rung.

1. **Native HTML + semantic tokens** — buttons, links, inputs, details/summary,
   native form controls. Correct for most simple surfaces. Needs: `:focus-visible`,
   adequate hit targets (≥44px interactive), reduced-motion handling. No dependency.
2. **Headless primitives** (Radix UI, Ark UI, Headless UI, Base UI) — bring only
   the accessibility + behavior (keyboard nav, focus trap, aria, DnD, combobox,
   dialog, menu) with no styling. Correct when you have a *stateful overlay* or
   complex a11y control: modal/dialog, select/combobox, popover, dropdown menu,
   tabs, tooltip. You style them with your own tokens.
3. **Styled component libraries / registries** — shadcn/ui (Radix-based,
   copy-in-your-tree, token-driven) is the de-facto standard for React/Next
   apps. Brings a consistent, installable component system. Correct when you
   want many controls fast AND accept adopting one styling convention.

Decision rule: adopt rung 2 the moment a stateful overlay or non-trivial
keyboard/aria control appears; reach rung 3 only when you need a broad control
surface quickly and are willing to take its convention. Never add a rung-2/3
library speculatively "while we're at it" — the first dialog is the trigger,
not the fourth.

**Anti-pattern:** injecting a styled component library into a surface whose
controls are all native and whose value is bespoke — it creates a *second*
styling convention and usually flattens the very personality the surface exists
to show. One styling convention per app (see interface-design + repo AGENTS).

## 3. Animation / motion split

Two dominant libraries, different jobs. Match the job, not the hype.

- **Motion** (`motion` npm package, motion.dev — formerly Framer Motion):
  React-native, declarative. The right tool for **UI transitions and
  micro-interactions** — entrances, hover/press, layout animations, mounts,
  presence, and declarative per-component motion (`<motion.div>`,
  `useReducedMotion`). Open-source core. Ships ready components like
  `Typewriter` (motion.dev/docs/react-typewriter).
- **GSAP**: imperative timeline engine. The right tool for **scroll-driven
  sequencing, complex multi-element timelines, and when you need frame control
  outside React's render model** (ScrollTrigger, timelines). Core is free;
  watch the licensing split — some plugins/Club features are paid. Prefer Motion
  for React UI unless you are genuinely doing scroll-timeline choreography.
- **Scroll-driven reveal** also reachable declaratively (Motion scroll hooks /
  IntersectionObserver) — that is where the repo's scroll-craft skill lives.

Rule of thumb (2026): Motion for anything that is a component transition on a
React surface; GSAP only for scroll-choreographed timelines that Motion's model
makes awkward. Both can coexist, but prefer one unless the second is genuinely
required. Every animation — any library — MUST respect `prefers-reduced-motion`
(useReducedMotion / reducedMotion config / a motion-query guard). Animation is
enhancement; content and a11y are the contract.

## 4. Where to SOURCE proven work (agent-addressable)

- **Motion** — motion.dev/examples: a large example catalog (text scramble,
  typewriter, number-trend, reorder, rolling-text, reveals). Motion exposes an
  **MCP** that can feed example source straight to the agent, and a "Motion UI"
  block line for shadcn apps. Use these as reference/copy sources, then adapt to
  the repo's tokens and reduced-motion policy.
- **GSAP** — official showcase + forums for scroll-timeline reference.
- **Component libraries** — the shadcn/ui registry (installable, token-driven
  components), Radix/Ark/Headless UI docs for headless behavior patterns.
- **Reference taste** — ui-ux-pro-max (local data), hue (design-language
  generation), awesome-design / taste lists (aesthetic anchors for casting).
  Pull inspiration as *anchors with named vocabulary*, never as wholesale pastes.

## 5. Licensing gates (verify before bundling/shipping anything)

The promise "grab everything to use it" breaks at licensing. Check before you
pack or ship:
- **Fonts**: display faces (e.g. dogica, dot-digital, HomeVideo, kitsch/pixel
  fonts) are frequently commercial or non-redistributable. A design-system
  package or download must ship only self-hosted-and-clearable fonts, or carry
  font metadata + an install-yourself path. Never assume a downloaded TTF is
  free to redistribute.
- **GSAP**: core MIT, but Club plugins and some advanced features are paid.
- **Motion+/Motion UI**: a paid tier gates parts of the example catalog /
  production-source blocks.
- **Icons**: check the icon-set license before bundling into an asset package.
- **Assets copied from example/registry sites**: not necessarily yours to
  redistribute; prefer adapting technique over shipping their files.

## 6. "Industry standard" — how far to push, without over-engineering

A proportionate standard beats a textbook stack that a small surface cannot
justify. The deciding questions, in order:
1. What is the surface? (one page / a section / an app with many states)
2. Does it have stateful overlays or complex a11y controls yet? (→ rung 2)
3. Does it need a broad, fast control surface? (→ rung 3)
4. Is the value bespoke personality that a generic layer would flatten? (→ keep
   native/hand-rolled, invest in tokens + primitives instead)

Industry-standard *organization* is always worth it and is tool-independent:
- semantic token layer single-sourced (tokens.css / tokens.json + skin contract),
- a DESIGN.md spec (intent, tokens, type register, skin system, motion
  principles + reduced-motion policy, layout/UX guidance),
- a clean primitives-vs-sections component split (proportionate — primitives
  only when reused 2+ or carrying real state/behavior; single-use markup stays
  inline in its section),
- full a11y hygiene (focus-visible, ≥44px targets, reduced-motion coverage).
That layer is the reusable asset; the specific library is a late, replaceable
choice.

## 7. Current-stack reference (parameterized tail — update when the stack moves)

As of 2026-09 the portfolio stack decision is:
- **design-sandbox /designs**: throwaway taste-test catalog — hardcoded demo
  directions, NOT exportable tokens (correct; tokenize only at graduation).
- **example-portfolio (/landing)**: **structured-bespoke + Motion, NO shadcn** —
  semantic token layer (`components/landing/tokens.css`) + F/J skin contract,
  native controls, `motion` added for the terminal typewriter + restrained
  micro-interactions only. Revisit trigger for a headless primitive (Radix):
  the first stateful overlay (modal/combobox/select) — then add that primitive
  styled with `--ld-*`, NOT a wholesale shadcn adoption.

When the stack changes, update this tail (and `~/.omp/agent/agents/ux-designer/
CAPABILITIES.md`) — do not let a stale "current" line mislead future sessions.

## 8. Curation discipline

When evaluating whether to add/adopt any new design tool, library, or agent
skill, run the classify/research/decide/refresh process in
`skill://ux-capability-curation` rather than adopting on vibes: name the concern
it serves, check overlap with the held stack (impeccable, web-design-guidelines,
vercel-react-best-practices, design-taste-frontend, interface-design, hue,
scroll-craft, ui-ux-pro-max), and record the outcome (adopted / rejected /
harvest-only) with a date in the registry. Skills are a map to concerns you
already own — do not stack duplicative ones.
