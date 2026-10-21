---
description: Benchmark a harness config on Harbor. Use when asked to eval, to benchmark, to measure a release on agent work, or whether a harness change helped — pick a job from evals/, read its pins, get the size and cost approved, run it, and report what it measured.
---

# /eval

Read `skill://eval` first — it owns what a trial is, the two pins, the first-run
setup, the approval rule and the artifact layout. This page is the runbook for one
run, and every flag in it is harbor's: `skill://harbor-cli` has the rest.

**The agent side is not a question; the config side is.** A trial answers "what did
this harness do to agent work", so the config tag is what the user chooses, and the
agent release is the newest unless they say otherwise. Nothing is spent until step
4 has been answered with a yes.

## Runbook

Run everything from the repo root (`~/.omp`), where `evals/` and `.harness-eval/`
live. Four variables carry the choices:

```sh
job=evals/omp-mirror-config.yaml
config_tag=omp-home-v0.8.0     # the tag the job's config_url names
agent_tag=v0.4.0               # step 2
pin="harbor-omp @ git+https://github.com/evanokeefe39/harbor-omp-mirror@$agent_tag"
```

1. **Pick the job.** List them, then read the chosen one's pins, environment and
   sizes:

   ```sh
   ls evals/*.yaml
   grep -n -E 'job_name:|model_name:|version:|config_url:|config_sha256:|config_ref:|^environment:|  type:|n_tasks:|n_concurrent_trials:' "$job"
   ```

   Say which environment it is before anything else: `docker` is local and free,
   `daytona` is billed. The `n_tasks:` lines are the size, and their sum is the
   trial count the approval is about. A job with no `config_url` — the install
   smoke — carries no config pin, so step 3 does not apply to it.

2. **Take the agent tag without asking** — the newest `harbor-omp-mirror` release,
   by version rather than by text:

   ```sh
   git ls-remote --tags --sort=-v:refname https://github.com/evanokeefe39/harbor-omp-mirror 'refs/tags/v*' | head -1
   ```

   Name a tag explicitly only when the adapter is the variable under test. Keep the
   commit it prints beside the tag: the run directory will not have it.

3. **Check the version pin against that tag** (OMP-49):

   ```sh
   git show $config_tag:agent/last-changelog-version
   ```

   It must equal the job's `version:`. If it does not, stop and fix the job — as it
   stands it would install an omp nobody chose.

4. **Show the plan, then get the yes on size and cost.** `--print-config` prints the
   resolved job — the model, the environment, the pins, the sizes, the concurrency —
   and `--dry-run` validates the config and the environment preflight. Neither spends
   anything and neither downloads a task. The dry-run prints the trial count for a
   registry dataset; for a git dataset it reads `unknown`, because membership needs
   the repository — either way the size the approval is about is the job's own
   `n_tasks:`.

   ```sh
   # docker: local and free
   uv run --no-project --with "$pin" harbor run -c "$job" -o .harness-eval/harbor --print-config
   uv run --no-project --with "$pin" harbor run -c "$job" -o .harness-eval/harbor --dry-run
   ```

   ```sh
   # daytona: billed, and the key has to reach harbor
   uv run --no-project --with "$pin" --with "harbor[daytona]>=0.24.0" harbor run -c "$job" -o .harness-eval/harbor --env-file ~/.omp/agent/.env --print-config
   uv run --no-project --with "$pin" --with "harbor[daytona]>=0.24.0" harbor run -c "$job" -o .harness-eval/harbor --env-file ~/.omp/agent/.env --dry-run
   ```

   Read the plan back to the user — the environment, the model, the trial count, the
   concurrency, the sandbox size, the omp version, and what that size costs — and
   ask. **A billed run is approved before it launches**: instance time and model
   tokens are spent, and the ask is the gate.

5. **Launch it, once the yes is in.** Same command as the plan, without `--dry-run`:

   ```sh
   # docker
   uv run --no-project --with "$pin" harbor run -c "$job" -o .harness-eval/harbor --yes
   # daytona
   uv run --no-project --with "$pin" --with "harbor[daytona]>=0.24.0" harbor run -c "$job" -o .harness-eval/harbor --env-file ~/.omp/agent/.env --yes
   ```

6. **Report the numbers from the run's own `result.json`**, not from anything that
   summarized it:

   ```sh
   jq '{trials: .n_total_trials, completed: .stats.n_completed_trials, errored: .stats.n_errored_trials, scores: [.stats.evals[] | .metrics[].mean], input_tokens: .stats.n_input_tokens, output_tokens: .stats.n_output_tokens, cache_tokens: .stats.n_cache_tokens, cost_usd: .stats.cost_usd, started_at, finished_at}' .harness-eval/harbor/<job-name>/result.json
   ```

   Report those with both pins and their commits, the task set, the trial count and
   the run's directory — the field list is in `skill://eval`. Then record it where
   the question was asked: the card's notes, the PR body, or the journal that owns
   the release. Name anything that makes it incomparable with another run (a
   different task set, a different concurrency, a smoke-sized slice).

7. **Hand the user the viewer command**, with the jobs directory it needs:

   ```sh
   harbor view .harness-eval/harbor
   ```

## Rules

- **Never launch without the yes.** Nothing in the command line records one, so an
  approval that was never given has nowhere to hide but the transcript — and a run
  that spent money without it is not undone by reporting it.
- **One run per question.** Do not re-run the same tags because the score was lower
  than hoped; a second run of the same thing is a second draw, not a better
  measurement.
- **A smoke is not a score.** `omp-install-smoke.yaml` and any two-task slice prove
  the path runs end to end, not how the harness performs. Say which one you ran.
- **Report harbor's own errors.** A refusal, a failed preflight or a dead sandbox is
  the run's answer: report it with the pins, and fix the job or the pin rather than
  editing around it.
- **A trial that was never run is not a result.** If harbor failed, report the
  failure; never summarize a partial run as a measurement.
