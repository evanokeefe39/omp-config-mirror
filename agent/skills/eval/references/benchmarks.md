# The dataset shortlist

A **curated shortlist**, not harbor's catalogue: the ids worth a first run, what
each one measures, and the cheap slice a job starts from. The registry's own name,
version and task count for each row were read from harbor's own listing
(2026-10-20, harbor 0.24.0) — plain `harbor datasets list` prints only the hub URL,
so the table comes from the listing behind it:

```sh
harbor datasets list --legacy
```

Three of the four jobs in `evals/` run `ade-bench` — a two-task slice for the two
measured ones, one task image for the install smoke — and the fourth reaches
`Snowflake-Labs/data-eng-bench` over git. Any id below that no job names yet is a
candidate for the next question, not a run that exists.

| id | what it measures | tasks | cheap slice |
|---|---|---|---|
| `ade-bench` | dbt Labs' Analytics Data Engineer Bench: dbt/SQL data-analytics engineering bugs, graded by the tasks' own singular dbt tests | 48 | 2 |
| `hello-world` | harbor's own one-task smoke: write `hello.txt` containing `Hello, world!` | 1 | 1 |
| `terminal-bench` | Terminal-Bench 2.0: agentic work in a terminal, in a container | 89 | 2 |
| `terminal-bench-sample` | harbor's 10-task sample of Terminal-Bench 2.0 | 10 | 10 |
| `terminal-bench-pro` | Terminal-Bench Pro (public set): the harder, longer, end-to-end terminal tasks | 200 | 2 |
| `swebench-verified` | SWE-bench Verified: the 500 human-validated issue-fixing tasks | 500 | 2 |
| `aider-polyglot` | aider's polyglot benchmark: code editing and generation across programming languages | 225 | 2 |
| `dabstep` | DABstep: multi-step data reasoning — payment-transaction data analysed with Python/pandas to answer business questions | 450 | 2 |
| `spider2-dbt` | Spider 2.0-DBT: dbt code generation over complex SQL projects and long contexts | 64 | 2 |
| `gaia` | GAIA: multi-step reasoning, tool use and multimodal question answering | 165 | 2 |
| `ds-1000` | DS-1000: data-science code generation across seven popular Python libraries | 1000 | 2 |

## The cheap slice

**Cheap means a smoke slice, not a score.** Two tasks prove the path runs end to
end — the sandbox boots, the config lands, the agent runs, the verifier grades —
and they are not a measurement of the harness. Say which size a run used when
reporting it; a mean over two tasks and a mean over the dataset are not the same
number and must not be compared.

The size is the job's own `datasets[].n_tasks:`, and it is what the approval is
about. Harbor applies it after any `task_names`/`exclude_task_names` filtering, so
with no filter it takes the first *n* tasks in the dataset's own order.

## What the choice costs

The shortlist is a starting point, not a price list: cost is instance time plus
model tokens, and both scale with the task, the sandbox and the agent's turns. What
the plan prints before a launch — the trial count and the concurrency — is the
number the user approves.

Two properties worth knowing before choosing:

- **ade-bench is the only family here that grades a data artifact** (the models the
  agent wrote, by running dbt tests over them), and its tasks are the heaviest: the
  job in this repo gives it `override_memory_mb: 2048`, an
  `agent_timeout_multiplier: 2.0`, and the `DBT_PACKAGE_HUB_URL` /
  `DBT_ENGINE_PACKAGE_HUB_URL` env vars that let dbt resolve packages offline. A new
  ade-bench job needs those, or the tasks fail in setup for reasons that have
  nothing to do with the agent.
- **`hello-world` is the smoke of smokes**: one task, no scoring value, and the
  cheapest way to prove a pin, a job file or a config route works before spending
  on a real family.

## A dataset the registry does not carry

That is a job in `evals/`, not an id: `omp-data-eng-bench-fast30.yaml` reaches
`Snowflake-Labs/data-eng-bench` over git with `repo:` + `ref:` + `task_names:`. Its
`ref:` is the full 40-hex commit, because harbor treats a ref as already resolved
only when it is one — anything else goes to `git ls-remote`, which cannot resolve a
short sha, and the run dies in setup.
