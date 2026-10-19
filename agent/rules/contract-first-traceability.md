---
description: A change touching a data contract must trace to a contract + a requirement. Never change a schema/contract without a named contract and a traceable requirement — and raise an Andon if the change orphans an existing contract or consumer.
alwaysApply: true
agents: ["data-*"]

---

# contract-first-traceability

Data changes are contract changes. Before altering any schema, model, or
derived column, the change must trace to:

- a **contract** (the schema/semantic guarantee being changed) and
- a **requirement** (why the change exists, traceable to intent).

- Never change a contract silently or as an afterthought. Name the contract and
  the requirement.
- If the change orphans an existing contract, consumer, or check — stop and
  raise an Andon rather than silently breaking it.
- Enumerate the consumers whose contract the change touches before implementing.
