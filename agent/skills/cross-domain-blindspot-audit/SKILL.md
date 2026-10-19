---
name: cross-domain-blindspot-audit
description: >
  Run a cross-domain expert-panel blindspot audit on a codebase, project, or
  plan. Use when asked to reveal blind spots, gaps, or risks in a project by
  examining it through multiple expert disciplines (sales/BD, recruiting,
  product/PM, operations/SOP, security/privacy, and the author's own domain).
  Triggers on "expert panel", "blindspot audit", "cross-domain review",
  "reveal my blind spots", "what am I missing", "review this from other
  disciplines".
version: 1.0.0
---

# Cross-Domain Blindspot Audit

A systematic method for surfacing blind spots a single-domain practitioner
cannot see, by explicitly wearing the hats of multiple expert disciplines and
grounding every finding in the actual repo, not generic advice.

## When to use

Use when the user wants a project/product/plan stress-tested from perspectives
outside their own expertise. Especially valuable when the subject is inherently
multi-domain (job-seeking, a SaaS, a marketplace, a go-to-market pipeline) and
the author is strong in one domain but not others.

## Method

### 1. Ground first (non-negotiable)

Read the actual repo/project before analyzing. Never give generic advice. For
each candidate repo:
- Read the README, architecture docs, roadmap, data model, and any skills/agents.
- Read the actual data files (tracker CSVs, config, .env keys, samples) to find
  *evidence* of behavior — not just intent. E.g. a tracker with all rows stuck
  at one stage is a finding; a doc that claims a feature works is not.
- Note the author's stated expertise to calibrate which domains are blind spots.

If the task spans multiple repos (e.g. a pipeline repo + a CRM repo), read both
and the interfaces between them.

### 2. Identify the funnel/flow blind spots

For a system with a pipeline or funnel, explicitly enumerate the funnels present
and missing. Common ones a single-domain author misses:

- **Feedback/learning funnel** — does the system consume its own outcomes?
  (Inputs are produced; are results fed back to retune?)
- **Sales/application funnel** — the core conversion funnel (lead → qualified →
  contact → meeting → close).
- **Lead-generation funnel** — upstream of sales; relationship-building,
  awareness, trust. Feeds the sales funnel; does not live inside it.
- **Referral funnel** — warm intros that skip the cold funnel entirely.
- **Inbound/content funnel** — portfolio/content as lead magnets; converts 5-10x
  cold but needs attribution.
- **Event/community funnel** — attend → follow up → relationship.
- **Time/effort funnel** — where does the author's own effort go by stage?
  Surfaces resource-allocation problems (e.g. over-building, under-closing).
- **Product funnel** — if the artifact becomes a product/users (onboard → use →
  feedback → refer). Often meta and missed.

### 3. Wear each expert hat

For each discipline, produce findings that are concrete, evidence-backed, and
specific to this project. Start with the domain the author already knows (the
"home lens", hardest to see their own assumptions) plus these default panelists:

- **Sales / BD** — pipeline close discipline, follow-up cadence, lead scoring
  routed into outreach, per-relationship vs per-message tracking, "next action
  by when".
- **Recruiter / hiring** — which channels actually convert, volume vs quality
  (is the pipeline delivering or just producing), company-side follow-up.
- **Product / PM** — feedback loops, instrumentation, onboarding, what data
  would validate the approach, does the tool close its own loop.
- **Operations / SOP** — cadence and rhythm: is anything scheduled, or is
  everything reactive? Are there "due now" actions surfaced?
- **Security / privacy** — especially when onboarding third-party users (their
  data = your responsibility). Design isolated/sanitized paths before data exists.
- **Data engineering** (the author's likely home lens) — are the model's weights
  or scores preference-based vs outcome-based? Is there ground truth / validation?

Adjust the panel to the domain: for a backend system swap in SRE/scale; for a
frontend swap in design/a11y. Keep it to a small, high-signal panel.

### 4. Find the through-line

Most findings across disciplines will converge on one or two structural gaps.
Name the through-line explicitly — it's the highest-leverage insight and the
thing that makes the audit feel coherent rather than scattered.

### 5. Deliverable

Produce:
1. The through-line finding (one paragraph).
2. Missing funnels (numbered list, each with what it is and why it's missing).
3. Per-discipline findings, each tagged with the discipline and evidence.
4. A prioritized recommendation (single highest-leverage change).

## Output discipline

- Every finding is grounded in something actually read (file path + observation).
- Distinguish *intent* (docs claim) from *evidence* (data shows).
- Offer to file the gaps as issues or a doc if the user wants to track them —
  don't unilaterally create artifacts unless asked.
- Mark inference explicitly; never fabricate repo contents.

## Do not

- Never give generic, discipline boilerplate — ground every finding in the repo.
- Never skip reading the actual repo/data because the user described it.
- Never overwhelm with a huge panel — small, high-signal, cross-domain.
- Never bury the through-line; it is the primary value of the audit.
