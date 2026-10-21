---
name: eval
description: "Benchmark a harness config on Harbor. Use when a trial is to be run, a release's effect on agent work measured, or a result compared — runs an eval trial and records what the result measured."
---

# eval

`/eval` is the entry point; `agent/commands/eval.md` is its runbook. There is no
wrapper script — a trial is harbor's own command over a job file in `evals/`. Read
`skill://harbor-cli` for flags; none are restated here.

Every result names the agent release, the harness config and the task set that
produced it. Without them a score cannot be compared to anything.

## What a trial is

Harbor runs it. One trial is one task, one agent, one config: harbor boots a
sandbox, installs the omp version the job names, unpacks the config the job pins
into `$HOME/.omp`, runs the agent on the task's instruction, and grades the result
with the task's own verifier. A *job* is a list of trials over one or more
datasets, and `result.json` in the run's directory is what it produced.

omp-home owns the two pins a trial bootstraps from and the record of what a result
was measured against. Harbor owns the rest.

## Where the jobs live

`evals/`, at the repo root, flat — one file per job. The job file **is** the pin:
its three config lines (`config_url`, `config_sha256`, `config_ref`) and the omp
`version:` line are the whole of what a run bootstraps from, so moving a release is
editing those lines in one file. Nothing resolves a tag at run time.

| job | environment | what it is |
|---|---|---|
| `omp-install-smoke.yaml` | docker | the cheapest real probe: build a task image, install Bun and omp, stop. No model spend, no agent run, no verifier |
| `omp-mirror-config.yaml` | daytona | a published config release measured on two ade-bench tasks, the job to cite or publish a result from |
| `omp-mirror-config-slice10.yaml` | daytona | the same pins on 10 ade-bench tasks at the full suite's memory and concurrency — the derisk step before the full run |
| `omp-mirror-config-full.yaml` | daytona | the full ade-bench suite on those pins: 45 tasks at 4096 MB, concurrency 2 |
| `omp-mirror-config-heavy.yaml` | daytona | the full suite's 8 GiB tier: the 2 tasks that OOM-kill at 4096, run one at a time |
| `omp-baseline-ade-bench.yaml` | docker | the same two ade-bench tasks on omp's *bundled defaults*, with no `config_dir` at all. Run beside the job above, the pair isolates what a bootstrapped `~/.omp` adds |
| `omp-data-eng-bench-fast30.yaml` | docker | the 30-task slice of `Snowflake-Labs/data-eng-bench`, reached over git |

A dataset harbor's registry does not carry is a job too, not a special case: name
it with `repo:` + `ref:` and pick the slice with `task_names:`, as
`omp-data-eng-bench-fast30.yaml` does. `ref:` must be a full 40- or 64-hex commit.
Harbor treats a ref as already resolved only when it is one; anything else goes to
`git ls-remote`, which cannot resolve a short sha, and the run dies in setup. Every
dataset states its own `n_tasks:`, and that number is the size the approval is about.

## The two pins

| pin | what it is | tag shape | how it is pinned |
|---|---|---|---|
| config | the harness the agent runs under, published by `agent/scripts/mirror-config.sh` at each omp-home release | `omp-home-vX.Y.Z` | `config_url` + `config_sha256` + `config_ref` (tag **and** the tag's commit), in the job file |
| agent | the adapter harbor imports, published from the runner repo at each of its releases | `vX.Y.Z` | the git tag, installed by uv from the tag at launch — `--with "harbor-omp @ git+…@<tag>"` |

- Both are required and they are independent. `omp-home-v0.8.0` and `v0.4.0` are
  releases of two repos; nothing makes one follow the other.
- The omp version must be the config tag's own. The job's
  `agents[].kwargs.version` is the omp the sandbox installs, and it must equal
  `agent/last-changelog-version` at the config tag the job names:
  `git show <config-tag>:agent/last-changelog-version`. A job carrying one
  release's version under another's tag runs a version nobody chose (OMP-49).
- The commit is the durable pin; the digest guards one download. GitHub does not
  promise a source archive stays byte-identical, so a `config_sha256` mismatch one
  day means re-download and re-check, not tampering by default.
- The run directory does not record the agent tag. Harbor writes the resolved job
  (the config pin's three values, the omp version, the model, the sizes) to
  `config.json`, and its own version to `lock.json`; the uv environment that
  supplied the adapter is in neither. Write the tag down with the result, and its
  commit with it (`git ls-remote <mirror> refs/tags/<tag>`).

## First run on a machine

A trial runs in a task environment, and which one is a preference rather than a
default this skill can guess. Resolve it before the first run, and ask the user
when the tree says nothing:

- **docker** — local and free, needs Docker Desktop running. It is harbor's default
  and needs **no extra**.
- **daytona** — cloud sandboxes, billed per instance-second, needs `DAYTONA_API_KEY`
  in the environment harbor runs in.
- **another backend** — harbor carries 31 extras beyond the default (e2b, modal,
  gke, runloop, beam, …), each one `uv tool install "harbor[<extra>]"`.

Then install harbor itself, once:

```sh
uv tool install harbor                    # docker
uv tool install "harbor[daytona]"         # daytona
```

`DAYTONA_API_KEY` lives in `~/.omp/agent/.env`, and harbor refuses a daytona job
without it: `Daytona requires either DAYTONA_API_KEY, or both DAYTONA_JWT_TOKEN and
DAYTONA_ORGANIZATION_ID, to be set.` That is what the runbook's `--env-file` is for.
Do not copy the key anywhere else — not into a job file, not into another `.env`,
not into a shell you are about to hand to someone else.

## Approval before a billed run

A billed run is approved on size and cost before it launches, in an interactive
ask. It spends instance time and model tokens, so the trial count, the model, the
sandbox size and the expected spend go to the user first, and the run starts only
after they answer. No flag carries that yes.

A local run needs no approval and no Daytona key. It still spends model tokens, so
the size is still the user's call when it is more than a smoke.

## The artifacts

Everything a run leaves is under `<cwd>/.harness-eval/harbor/<job-name>/`, where
`<job-name>` is the job file's own `job_name:`:

| file | who writes it | what it answers |
|---|---|---|
| `config.json` | harbor | the resolved job it ran — the config pin's three values, the omp version, the model, the sizes, the concurrency |
| `lock.json` | harbor | harbor's own version and commit, and a task lock (name, digest, git commit) for every trial |
| `result.json` | harbor | the run's own numbers, written as it goes. The authority for what it scored |
| `<trial>/` | harbor | one directory per trial: its own `result.json`, the agent's transcript, the verifier's output |

`harbor view` defaults to `./jobs`, which is not where these land, so always pass
the directory:

```sh
harbor view .harness-eval/harbor
```

Harbor's paths are Windows-native here: give it a relative path or a `~`-expanded
one (`~` resolves to `C:\Users\evano`). A git-bash path like `/c/Users/...` reaches
it as `\c\Users\...` and is refused as missing (measured 2026-10-20).

## What a result must record

Whatever the result lands in — the card, a run journal, a PR body — it carries:

| field | why |
|---|---|
| agent tag + commit | which adapter ran; nothing in the run directory says it |
| config tag + commit | which harness ran; the commit survives a re-generated archive |
| task set (dataset and task names) | what "0.5" is 0.5 *of* |
| trial count | one trial is an anecdote |
| omp version | the sandbox's own version, from the job's `agents[].kwargs.version` |
| status, score, tokens, cost, wall time | the measurement itself, read from `result.json` and never from a summary line someone typed |

Status (`completed` / `errored`, from the trial counts) says whether every trial
finished; score is the eval's own metric mean. They are different questions, and
neither claims more about the agent's work than that metric measures.

## Scaffolding

- A task tree: `harbor tasks init <name>`.
- An adapter: `harbor adapters init <name>`.
- A job config: `harbor jobs init <path>.yaml` writes one, empty until you forward
  run flags to it, or every field of the config model with `--full`. Our jobs are
  pinned by hand, so the shorter route to a new one is to copy a file from `evals/`
  and edit its pins, its environment and its sizes.

## Done when

- The plan was shown, and a billed run was approved on its size and cost before it
  launched.
- The run's directory holds harbor's `config.json`, `lock.json` and `result.json`,
  and every number reported came from `result.json`.
- The record names both pins with their commits, the task set and the trial count.
- The job file's `version:` agrees with the config tag it names
  (`git show <tag>:agent/last-changelog-version`), and the commit in `config_ref`
  is the one the mirror serves (`git ls-remote <config-mirror> refs/tags/<tag>`).

## Where it lands

`agent/commands/eval.md` (the `/eval` runbook),
`agent/skills/eval/references/benchmarks.md` (the curated dataset shortlist),
`evals/*.yaml` (the jobs), `agent/docs/eval-runs.md` (the run journal — one row per run,
with the pins and the numbers, so a result outlives the card that asked for it), and the
run's own directory under `<cwd>/.harness-eval/harbor/`.
