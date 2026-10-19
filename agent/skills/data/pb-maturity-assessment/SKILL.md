---
name: pb-maturity-assessment
description: "Declare maturity on the domain's ladder and what that level makes proportionate."
---
## When

Sizing standards, process or ceremony to a project: before writing or applying a
standard to it, before adopting a heavier playbook or check because a bigger
project would need one, or when inheriting a scope whose level was never
declared.

Not: writing a behavioural spec (`pb-spec`); designing a change (`pb-design`);
discovering an external source (`pb-source-discovery`).

The output is a declared level plus what that level makes proportionate, so
downstream standards do not overcook a hobby project.

## Outcome

A declared maturity level from the domain's own ladder — or from the fallback
ladder below when the domain has none — with the observable signals that place
it there, and at least one standard the level requires and one it makes
overkill.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- The domain's own ladder is named, or the fallback ladder was used with the
  reason no domain ladder exists
- A level is declared, with the observable signals that place it there
- What the level makes proportionate is stated: one standard the level requires
  and one it makes overkill
- Reply: the declared level, the ladder used, and one standard made
  proportionate by it.

## Fallback ladder

The built-in fallback for a domain with no ladder of its own: two ends, hobby
and enterprise. Place the project nearer one end on the observable signals —
team size, number of sources/services, who consumes the output, and whether a
change can break someone else — and declare the level in those terms.

| domain | hobby end | enterprise end |
|---|---|---|
| full-stack app | One person, one deployable, the users are the owner; a broken change costs only the owner's time | A team, several services, external users; a change can break someone else's work or their data |
| data platform | One or two people, a handful of sources, the warehouse serves the owner's own analysis; a failed load costs the owner a re-run | Several engineers, many sources and marts, downstream dashboards depend on freshness; a silent dropout breaks someone else's report |
| IaC | One person, a few stacks in one account, a wrong plan is reverted by hand | A team with review gates, many environments, a wrong apply takes down shared infrastructure |
| content/media | One creator, a handful of outlets, output consumed directly by the audience; a mistake is one post | An editorial team, many channels and scheduled pipelines; a bad publish reaches an audience it cannot be recalled from |
