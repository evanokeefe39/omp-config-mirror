---
description: "Apply when facing a novel design decision with no precedent in the codebase. Build 2-3 competing sketches, compare them whole-shape side by side before committing."
agents: ["*-engineer"]
---

# Exhaust the Design Space

When the right answer is not obvious, do not pick the first workable idea. Build **2–3 competing sketches** of the whole design — different shapes, not the same shape twice — and compare them side by side against the approved spec before committing. Building the wrong thing costs more than exploring three options.

**Whole-shape, not point fixes.** Each sketch answers the same contracts a different way: different data shapes, different seams, different ownership. A second flavour of the first shape does not count; a variation that changes one knob inside an otherwise-identical design is not a competing sketch.

**Compare side by side.** Put the sketches next to each other against the spec's contracts, edge cases and negative space, and name what each one wins and loses. The comparison, not the sketches, is what exhausts the space: it shows what the constraint space actually forces, and makes the committed design's trade-offs explicit instead of incidental.

**Where it applies:**
- Novel interactions or architectural choices with no prior art in the codebase
- Multiple viable approaches with no obvious winner
- Decisions where the trade-off is felt, not computed (feel, ergonomics, maintainability)

**Where it does not:**
- Mechanical implementation where the pattern is established
- Bug fixes or refactors with a clear target state
- Changes whose constraints dictate a single viable approach

For the playbook that routes this work, see `skill://pb-design`.

Source: pstack@157aae39 skills/principle-exhaust-the-design-space (MIT — skill://operating-mode/LICENSE-pstack.txt).
