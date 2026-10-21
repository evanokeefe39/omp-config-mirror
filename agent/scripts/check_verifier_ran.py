#!/usr/bin/env python3
"""Name every trial in a harbor run that executed no test.

Why this exists
---------------
A trial can score 0 for a reason that has nothing to do with the agent: the
verifier's `dbt deps` cannot reach its package index, or a task's own setup
fails, so no test ever runs. The reward is then 0 and is indistinguishable, in
`result.json` alone, from an agent that answered wrongly. That is a silent
failure: the run looks complete and the number is wrong.

The distinguishing evidence is the verifier's own stdout, which ade-bench writes
to `<run-dir>/<trial>/verifier/test-stdout.txt` and which ends with a line like:

    [ade-bench] actual_test_total=4, actual_pass=4, actual_fail=0

`actual_test_total=0`, or no such line at all, is a trial that ran no test.
This script reads exactly that, names every affected trial, and exits non-zero —
so a run is not "done" until it is clean.

What it does not prove
----------------------
That the tests that DID run were the right ones, that the agent's answer was
correct, or that the task's setup was otherwise sound. It proves only that a
test executed, which is the difference between a measurement and a zero that
belongs to the platform.

Usage
-----
    uv run --no-project python agent/scripts/check_verifier_ran.py <run-dir>

`<run-dir>` is a job's directory under a harbor `jobs_dir`, e.g.
`.harness-eval/harbor/<job-name>`. Exit 0 when every trial ran at least one
test, 1 otherwise, 2 on a usage error.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# The line ade-bench's verifier writes last. Matched loosely on the prefix so a
# renamed harness tag does not silently stop matching: the field is what matters.
_TOTAL_RE = re.compile(r"actual_test_total\s*=\s*(\d+)")

# A trial's own directory holds one of these at the top level; anything else in
# the run dir is the run's own bookkeeping, not a trial.
_RUN_FILES = {"config.json", "lock.json", "result.json", "job.log"}


def read_total(stdout: Path) -> int | None:
    """The last `actual_test_total` in the verifier's stdout, or None."""
    try:
        text = stdout.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    totals = _TOTAL_RE.findall(text)
    # Last wins: a verifier that runs dbt twice prints the line twice, and the
    # final one is the verdict the reward was computed from.
    return int(totals[-1]) if totals else None


def trials(run_dir: Path) -> list[Path]:
    """Trial directories under a run dir, in a stable order."""
    return sorted(
        p
        for p in run_dir.iterdir()
        if p.is_dir() and p.name not in _RUN_FILES and not p.name.startswith(".")
    )


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"usage: {Path(argv[0]).name} <run-dir>", file=sys.stderr)
        return 2

    run_dir = Path(argv[1])
    if not run_dir.is_dir():
        print(f"check-verifier-ran: no such run directory: {run_dir}", file=sys.stderr)
        return 2

    found = trials(run_dir)
    if not found:
        # An empty run is not a clean run. Refusing is the fail-closed choice:
        # the alternative is reporting success for having checked nothing.
        print(f"check-verifier-ran: no trial directories under {run_dir}", file=sys.stderr)
        return 1

    bad: list[tuple[str, str]] = []
    for trial in found:
        stdout = trial / "verifier" / "test-stdout.txt"
        if not stdout.is_file():
            bad.append((trial.name, "no verifier output (the task never reached a test)"))
            continue
        total = read_total(stdout)
        if total is None:
            bad.append((trial.name, "verifier ran but printed no test count"))
        elif total == 0:
            bad.append((trial.name, "ran no test (actual_test_total=0)"))

    print(f"check-verifier-ran: {len(found) - len(bad)}/{len(found)} trials ran a test")
    for name, why in bad:
        print(f"  FAIL {name}: {why}")

    if bad:
        print(
            f"check-verifier-ran: {len(bad)} trial(s) executed no test — the run is not a "
            f"measurement of the agent",
            file=sys.stderr,
        )
        return 1

    print("check-verifier-ran: every trial executed at least one test")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
