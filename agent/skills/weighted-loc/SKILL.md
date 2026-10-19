---
name: weighted-loc
description: "Use when asked to analyze codebase complexity or technical debt, how much custom code a codebase holds, or weighted LOC. Produces a tiered weighted-LOC report with a file tree, flagging blocks that re-implement what a framework already provides."
---

# Weighted LOC analysis

Measure how much a codebase costs to maintain by weighting every block of code
by how much leverage it takes from the frameworks, libraries and conventions
around it. Custom code is expensive; idiomatic use of a framework is cheap. The
report lands in `.weighted-loc/last_report.md`; the format is
`skill://weighted-loc/references/report-format.md`.

## When NOT to use

- Asking about a single file's complexity (just read it)
- Asking about cyclomatic/cognitive complexity (different metric)
- Asking about code coverage or test quality

## Terminology

**IoC (Inversion of Control)**: A design principle where the framework
calls your code, rather than you calling the framework. The Hollywood
Principle: "Don't call us, we'll call you." Concretely, the framework
owns the main execution loop and invokes your code through predefined
extension points (decorators, base class overrides, directory conventions,
CLI entry points). A library does the opposite: you call it, it returns,
and control stays with you.

**Idiomatic pattern**: The natural, expected way to express something in a
given language or framework. About *expression*, not correctness. "This is
how a Go programmer would write this." A non-idiomatic solution may be
correct but will feel foreign to readers of that language/framework.

**Industry standard pattern**: A pattern formally adopted as the norm by a
standards body, framework maintainers, or dominant ecosystem. Prescriptive
and authoritative. E.g., REST conventions, 12-factor app, SOLID.

**Convention**: What the community does by default, even if not formally
documented. "Convention over configuration." Descriptive of common practice
rather than a formal rule. E.g., naming a file `utils.py` for helpers,
putting tests in a `tests/` directory, using `conftest.py` for shared
pytest fixtures.

**Community accepted**: A pattern that has gained broad consensus through
organic adoption over time. Less formal than "industry standard" but more
than one person's preference. E.g., using a `Makefile` for build tasks in
C projects, `conftest.py` for shared pytest fixtures.

**Best practices**: Recommendations distilled from collective experience,
often codified in style guides, framework docs, or community resources.
Advisory, not mandatory. E.g., "prefer composition over inheritance",
"keep functions under 20 lines".

### Ontology axes

**Axis A — Expression vs. Practice:**

| | Expression | Practice |
|---|---|---|
| Question | "Does this *read* like the language?" | "Is this *how you should do it*?" |
| Members | Idiomatic | Industry standard, Best practice, Community accepted, Convention |

**Axis B — Formality (within Practice, most → least formal):**

| Position | Term | Source | Modality |
|----------|------|--------|----------|
| 1 | Industry standard | Standards body, RFC, framework maintainers | MUST / SHALL |
| 2 | Best practice | Style guides, framework docs, linter rules | SHOULD |
| 3 | Community accepted | Organic consensus, ecosystem-wide adoption | SHOULD (unwritten) |
| 4 | Convention | What people actually do | IS (descriptive) |

All five are signals that a block is tier 2 rather than tier 4.

## Inheritance weight rule

A fully custom inheritance hierarchy (rooted in `object`, no
framework/library/stdlib parent) is expensive to maintain. All classes
in such a hierarchy get **20×**.

Walk up the MRO past project-defined classes. Look at the **first
non-project ancestor**:

| First non-project ancestor | Weight |
|----------------------------|--------|
| Framework / library / stdlib class | Normal tier |
| `object` (or absent — class defined with no parent) | **20×** |

| Hierarchy | First non-project ancestor | Weight |
|-----------|----------------------------|--------|
| `NotFoundError` → `MyError` → `Exception` | `Exception` (stdlib) | 10× |
| `MyOp` → `MyBaseOp` → `BaseOperator` (airflow) | `BaseOperator` (framework) | 10× |
| `ApiError` → `HTTPException` (fastapi) | `HTTPException` (framework) | 10× |
| `MyChild` → `MyBase` → `object` | `object` | **20×** |
| `MyChild` → `MyBase` (no parent declared) | `object` (implicit) | **20×** |

A **block** is tier 5 if the class is part of a fully custom hierarchy
(i.e., the class's first non-project MRO ancestor is `object`). The base
class block and all its subclass blocks are tier 5.

## Documentation comment penalty

Comment blocks that violate the project's comment conventions get **20×**.

### Detection

1. **Identify the project's comment conventions** from:
   - Linter rules (e.g., `pydocstyle`, `eslint`, `golangci-lint` comment rules)
   - Style guide / CONTRIBUTING.md if present
   - Observed pattern in the codebase (what do well-regarded files look like?)
   - Language-specific norms (docstring style, `//` vs `/* */`, etc.)

2. **Flag comment blocks that violate those conventions** by being
   disproportionately verbose. Specifically:
   - Prose paragraphs explaining architecture or design rationale
   - Step-by-step narration of what the code does
   - Content that duplicates a README, ADR, or docs page
   - Comment blocks that would be caught by a linter's comment-length
     or comment-style rule if one existed

3. **What does NOT get flagged:**
   - Comments that conform to the project's observed conventions
   - Brief one-liners, TODO/FIXME markers
   - Comments explaining a non-obvious *why*
   - License headers, generated-file banners
   - Config file comments (tier 1 already)

### Rationale

- Comments go stale. Docs can be tested, linked, and versioned.
- If the project's linter or style guide says "keep comments to one
  line," a 30-line block is a violation regardless of language.
- The penalty is for *violating the project's own standard*, not for
  commenting per se.

## False Abstraction

A common anti-pattern (especially in AI-generated code): the agent sees
repeated boilerplate, extracts a custom abstraction, and builds code that
the framework's **conventions** already provide. This produces tier-4 or
tier-5 code where tier-2 code was intended.

### Examples

| Framework | AI creates | Tier | Framework convention |
|-----------|-----------|------|---------------------|
| FastAPI | `core/exceptions.py` — flat: `class NotFoundError(Exception)` | 4 | `HTTPException` subclasses + `@app.exception_handler` |
| FastAPI | `core/deps.py` — custom DI container class | 4 | `Depends()` — the framework's DI is the convention |
| Airflow | `core/operators/base.py` — `class MyBaseOp(object)` + subclasses | 5 | `@task(retries=3)` — the decorator IS the convention |
| Airflow | `core/operators/base.py` — `class MyBaseOp(BaseOperator)` + subclasses | 4 | `@task(retries=3)` — the decorator IS the convention |
| Dagster | `core/resources/base.py` — custom resource base (no framework parent) + subclasses | 5 | `@resource` decorator + `ResourceDefinition` |
| Django | `core/managers.py` — shared `BaseManager(object)` + subclasses | 5 | Define managers on the model; shared ones in the app's `managers.py` |
| Rails | `core/` with `BaseService` + `BaseController` (no framework parent) + subclasses | 5 | Inherit from `ApplicationController` / `ApplicationRecord` |
| Spring Boot | `core/` with `AbstractService<T>` + `AbstractRepository<T>` (no framework parent) + subclasses | 5 | `@Service` + `JpaRepository<T, ID>` |

### Rule of thumb

Before extracting a base class or "core" module, ask: **does the framework
already provide this via a decorator, annotation, file convention, or
built-in handler?** If yes, the convention is the abstraction — don't
add another one on top.

## Data location

All generated data lives in `.weighted-loc/` at the project root:
- `dep_profiles.yaml` — per-dependency profiles (living document, merged each run)
- `last_report.md` — previous report (for `--diff`)
- `last_report.html` — the single-page HTML report (with `--html`)

This path is harness-agnostic. Do not write to agent-specific directories.

## Process

### 1. Discover dependencies
Read all dependency manifests:
`pyproject.toml`, `requirements*.txt`, `setup.py`, `package.json`,
`pnpm-lock.yaml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`,
`Gemfile`, `composer.json`, `*.tf`, `Dockerfile`, `docker-compose*.yml`,
`Makefile`, `justfile`

Also read linter configs and style guides to identify the project's
comment conventions:
`.pylintrc`, `pyproject.toml` [tool.ruff], `.eslintrc`, `golangci-lint.yml`,
`CONTRIBUTING.md`, `STYLE.md`, `.editorconfig`

Output: flat list of declared deps with versions + comment conventions.

### 2. Update dependency profiles
**Read** `.weighted-loc/dep_profiles.yaml` if it exists.

For each dep in the current manifest:
- **New dep** (not in profiles): web-search its docs, create a profile entry.
- **Existing dep, same version**: keep the existing entry. Optionally refine
  `idiomatic_patterns` if you observe usage in the codebase that the profile
  doesn't capture.
- **Existing dep, version changed**: re-research, update the entry.
- **Dep removed from manifest**: delete its entry from the profile.

For each dep, web-search its documentation and determine:

| Field | Values |
|-------|--------|
| `type` | `framework` (uses IoC) / `library` (you call it) / `config-only` |
| `idiomatic_patterns` | what standard usage looks like in this codebase |
| `extension_points` | what the framework supports as customization |
| `directory_conventions` | expected file/folder layout |

IoC detection signals (language-agnostic):
- Decorator registration (framework calls your decorated function)
- Subclass + template method (framework calls your overridden method)
- Directory convention (framework expects specific project layout)
- CLI entry-point invocation (framework's main loop drives execution)

**Write** the merged result back to `.weighted-loc/dep_profiles.yaml`.
This file is a living document — it accumulates and refines across runs.

### 3. Classify each block
For every source file (exclude `node_modules`, `vendor`, `.git`, build
artifacts, generated code), identify its **blocks** and assign a tier
to each block.

A **block** is a natural unit of code: a class definition (including its
methods), a top-level function, a config section, a contiguous group of
related statements at module level, or a contiguous comment block.
Module-level code between definitions is its own block.

| Tier | Weight | Rule |
|------|--------|------|
| 1 | 1× | Config, manifests, IaC, docker-compose, YAML/TOML/JSON config |
| 2 | 2× | Idiomatic use of a framework or library (standard patterns) |
| 3 | 5× | Uses a framework's extension/plugin API (IoC extension points) |
| 4 | 10× | Fully custom — no external deps, hand-rolled |
| 5 | 20× | A class in a fully custom inheritance hierarchy (rooted in `object`), OR a comment block that violates the project's comment conventions |

The weight is a property of the tier, **not** the tier's number — tier 3 is 5× and tier 4
is 10×. There is no 3× or 4× weight; a report showing any weight outside
{1×, 2×, 5×, 10×, 20×} is malformed.

Classification order per block (first match wins):
1. Is it a config/manifest block? → **1**
2. Does it use IoC patterns from a dep's `extension_points`? → **3**
3. Does it import/use a framework or library in `idiomatic_patterns`? → **2**
4. No external deps? → **4**
5. Override: if the block contains a class whose first non-project MRO
   ancestor is `object` (fully custom hierarchy), bump to **5**.
6. Override: if the block is a comment block that violates the project's
   comment conventions (per the Documentation comment penalty section),
   bump to **5**.

A file's weighted LOC is the **sum of its blocks**:

    file_weighted = Σ (block_lines × block_tier_weight)

Notes:
- A single custom class inheriting from stdlib/framework (e.g.,
  `MyError(Exception)`, `MyOp(BaseOperator)`): stays at its normal tier.
  The 20× only applies to classes in a hierarchy rooted in `object`.
- Non-idiomatic library usage that reimplements framework-adjacent logic: **3**
- Non-idiomatic library usage that's fully custom: **4**

### 4. Identify findings
During classification, record any block where:
- A framework convention or idiomatic pattern is violated (e.g., manual
  connection management instead of the framework's built-in pooling)
- A "core"/"base"/"common" package re-implements what a framework decorator,
  annotation, or built-in handler already provides (False Abstraction)
- Code uses a non-idiomatic approach where the community convention is
  well-established
- A best practice is clearly violated in a way that increases maintenance cost
- A fully custom inheritance hierarchy exists where the framework's convention
  already provides the abstraction
- A comment block violates the project's comment conventions (content
  belongs in docs)

Each finding is recorded with: file, block (class/function name or line
range for comments), the violation, what the convention/idiomatic pattern
should have been, and a severity.

### 5. Produce report
Output format: `skill://weighted-loc/references/report-format.md`

Write the report to `.weighted-loc/last_report.md`. With `--html`, also emit the
single-page HTML report — `skill://weighted-loc/references/report-html.md` — to
`.weighted-loc/last_report.html`: the same numbers, rendered for readers outside the repo.

## Options
User may request in prompt:
- `--expand <dir>`: don't collapse that directory in the tree
- `--top N`: show only top N heaviest subtrees
- `--by-tier N`: filter to one tier
- `--diff`: compare against `.weighted-loc/last_report.md` (previous run)
- `--all-findings`: show all findings, not just top 20
- `--html`: also emit the single-page HTML report to `.weighted-loc/last_report.html` (for external stakeholders)
