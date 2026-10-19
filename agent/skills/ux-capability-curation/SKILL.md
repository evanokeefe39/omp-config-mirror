---
name: ux-capability-curation
description: Classify, research, and integrate (or reject) a design/UI-UX agent skill for the ux-designer + ux-engineer stack while preserving separation of concerns and freshness. Use when asked to add, evaluate, refresh, or reclassify a Claude/agent skill (e.g. "should we add this design skill", "what does this list of skills add", "audit new skills against our stack"). Produces the capability map in ~/.omp/agent/agents/ux-designer/CAPABILITIES.md.
---

# UX capability curation — keep the ux-engineer skill stack orthogonal and fresh

The goal is NOT to collect many skills. It is to own a small set of skills where each owns ONE
concern, nothing is duplicated, nothing stale is kept, and every addition is deliberate and
traceable. This skill is the repeatable process behind the capability registry.

## Where things live
- Live skill root (discovery): `~/.agents/skills/<name>/SKILL.md` — one-level, non-recursive; the
  agents provider reads this root (`enableAgentsUser: true`).
- Capability map / registry: `~/.omp/agent/agents/ux-designer/CAPABILITIES.md` (concern taxonomy,
  active stack, classified-rejects with dates, KB scan).
- Implementer wiring: `~/.omp/agent/agents/ux-engineer.md` (autoloadSkills + on-demand routing).
- Design wiring: `~/.omp/agent/agents/ux-designer.md` (routes units to concerns, reads registry).

## Classification vocabulary (decide this FIRST, in this order)
- **orthogonal** — opens a genuinely NEW concern not covered by any incumbent. Candidate for adding.
- **overlap** — same concern as an incumbent skill. Do NOT add a second; keep the better incumbent.
- **supersedes** — the new skill replaces an incumbent (e.g. a command/engine version replacing a
  prose-only original). Swap it in, retire the old.
- **obsolete** — no longer wanted / superseded; retire and record it (with date) so it is not
  re-added.
- **phantom** — marketing name with NO canonical repo (name searches hit only noise / unrelated
  projects / 0-star showcases). Record + never chase.
- **stale** — real repo but inactive and/or tiny/derivative and/or no license. Record + do not install
  unless a fresh source materially changes it.
- **license-gate** — useful + real but no clean license file (badge-only MIT etc.). Harvest
  principles only; NEVER vendor wholesale.
- **harvest** — no standalone install needed; extract the useful intent into agent prose (e.g.
  mobile-first/responsive rules) instead of adding a skill.

## Process
1. **Enumerate the candidate(s).** If from a list/post/KB, transcribe every name. If scanning the KB
   (`agent-knowledgebase` uiux corpus: `kb-posts.json` tools_apps/resources, `uiux-knowledge-digest.md`),
   extract the distinct named tools/skills/MCP first.
2. **Classify against the registry.** Read `CAPABILITIES.md`. Map each candidate onto an existing
   concern (concern 1 craft/audit, 2 taste, 3 design-intelligence, 4 product-UI, 5 brand-tokens,
   6 motion/scrollytelling, 7 mobile-first/responsive, 8 reference/origin). A name that maps onto a
   covered concern → overlap/supersede; only a genuinely new concern → orthogonal.
3. **Research the real source.** Use GitHub: repo-search API
   `https://api.github.com/search/repositories?q=<name>+claude+skill` then
   `https://api.github.com/repos/<owner>/<repo>` for stargazers_count / forks_count / created_at /
   pushed_at / license / archived, and read the README from
   `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/README.md` (does not count against the API
   limit). Disambiguate marketing names — check whether it is a standalone repo vs a sub-skill inside
   a bundled collection, and whether it is a derivative "merged synthesis" of skills you already hold.
4. **Verdict + license.** Judge by activity, license, self-containment, and concern-overlap — NOT star
   counts (this space inflates them). Only clean-licensed, self-contained, orthogonal skills are
   install candidates.
5. **Integrate (only if orthogonal + clean):**
   - Vendor the self-contained skill dir to `~/.agents/skills/<name>/SKILL.md`. Verify one-level
     layout + valid `name`/`description` frontmatter; confirm internal references (engine/, scripts/,
     references/, data/) travel inside the dir so it resolves after the next restart.
   - Decide load mode: `auto` (autoloadSkills) ONLY if it is light AND always relevant; otherwise
     `on-demand` (documented routing, read `skill://<name>` when the concern applies). Heavy engines
     (data libraries, verification harnesses) are ALWAYS on-demand.
   - Wire: add to `ux-engineer.md` autoloadSkills (auto) or its on-demand routing note (on-demand);
     update `ux-designer.md` only if routing/prose changes; record the concern + load mode + source +
     date in `CAPABILITIES.md`.
6. **Reject correctly:** phantom / stale / overlap / license-gate / superseded names go into
   `CAPABILITIES.md`'s classified-rejects section WITH the classification date, so future sessions do
   not re-litigate. Harvest-only intent goes into the relevant agent prose.
7. **Freshness:** note that skill discovery is process-static — a newly vendored skill resolves only
   after a fresh session. Record today's date as the classification date. Re-run this skill when a
   new list/stack/KB addition appears rather than improvising.

## Definition of done
- Every candidate classified (installed / rejected-with-date / harvested) and recorded in
  `CAPABILITIES.md`.
- Each installed skill is a self-contained, clean-licensed dir in `~/.agents/skills/` with valid
  frontmatter, wired as auto (light+always) or on-demand, and its load mode justified.
- No duplicate-concern skills added; no phantom/stale/license-gate name installed wholesale.
- You stated that a fresh session is required before the new skill(s) resolve.
