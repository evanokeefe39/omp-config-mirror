---
name: app-design-standards
description: Domain design checklist for the app-backend-designer: every candidate is screened against twelve/fifteen-factor items, the C4 container view, failure modes and migration before it is returned.
---

Not: this skill does not replace `pb-design` — it is the screening checklist the
app-backend-designer applies to its own candidate inside pb-design's diverge step.

## Design checklist

Screen every candidate against each item; a failed item goes into `risks`, never silently.

- **Twelve/fifteen-factor items that bear on design:**
  - **Config** — settings come from the environment, never baked into the artifact.
    (12-Factor III: https://12factor.net/config)
  - **Backing services** — databases, queues and caches attach as URL-addressable
    resources, swappable without code change. (12-Factor IV: https://12factor.net/backing-services)
  - **Statelessness** — no in-process or local state anything can be lost from;
    state lives in backing services. (12-Factor VI: https://12factor.net/processes)
  - **Disposability** — say what happens on crash, SIGTERM and scale-down.
    (12-Factor IX: https://12factor.net/disposability)
  - **Logs** — event streams to stdout, not local files. (12-Factor XI: https://12factor.net/logs)
  - **API-first** — the service's API is designed and published before clients. (15-factor: https://15factor.com/)
  - **Telemetry** — name the metrics, traces and health probes the design ships. (15-factor)
  - **Authn/z** — name who authenticates and who authorizes what, at every boundary. (15-factor)
- **C4 container view.** Sketch the container diagram: the containers in scope, their
  responsibilities, and every inter-container interface. C4 is a visualization
  vocabulary for stable boundaries, not a lifecycle. (C4 model: https://c4model.com/)
- **Interfaces and failure modes.** For each interface, name the contract and the
  behaviour when the dependency behind it fails — timeout, retry, fallback, or fail.
- **Migration and rollback.** Name how data and deployments move into the design, how
  they move back out, and what is one-way and unrecoverable.

## Sources

- The Twelve-Factor App (Heroku, 2011) and the fifteen-factor revision (Hoffman, 2016)
- C4 model for visualizing software architecture
- `findings/spec-driven-design-2026-deep-research.md`, §Twelve and fifteen factors,
  §C4 and arc42 (a research scope, branch `docs/findings-spec-driven-design`)
