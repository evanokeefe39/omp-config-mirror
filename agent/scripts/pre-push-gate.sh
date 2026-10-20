#!/bin/sh
#
# pre-push-gate — the CI gate, on this machine, before the push.
#
# A push that will go red should fail here rather than in a queue: a required
# check stuck behind a run of obsolete ones costs a review round, and this costs
# seconds. Measured 2026-10-19 (OMP-41): 84 `pr-title` and 65 `ci` runs in one
# day for 11 PRs, the worst single PR starting 17 and 11.
#
# HOW IT IS WIRED. The hook git actually runs is `~/.git-hooks/pre-push`, and it
# is lefthook's own wrapper — not this repo's to replace. `install-git-hooks.sh`
# refuses an unmanaged hook by name, deliberately, and this repo does not work
# around that: it extends lefthook's CONFIGURATION instead (`lefthook.yml`,
# `pre-push:`), so the wrapper stays exactly as lefthook wrote it. The wrapper
# runs `lefthook run pre-push`, lefthook reads `lefthook.yml` from the push's own
# repo root (a worktree included) and runs this script. Nothing else in the hook
# chain changes; `git commit` is untouched.
#
# The residual gap is lefthook's own: if no lefthook binary is on PATH and none
# is in the repo's `node_modules`, its wrapper prints "Can't find lefthook in
# PATH" and exits 0, so this gate does not run. That is lefthook's fail-open
# direction, not this script's — nothing here can see it happen. (Measured on
# this machine 2026-10-20: the wrapper resolves lefthook through the absolute
# path it hardcodes, so the gate does run.)
#
# THE CHECK LIST IS ci.yml's, in ci.yml's order, by invoking the same scripts —
# nothing here re-implements a check. Two differences are deliberate.
#
# ci.yml points `~/.omp` at the checkout before skill-root-check, because a runner
# has no harness home; on a machine that HAS one the check reads the live harness
# home, which is the arrangement it exists to assert. So it reports on the checkout
# `~/.omp` points at, which need not be the worktree being pushed.
#
# And this script does NOT run the gate's own regression case
# (`agent/scripts/tests/pre-push-gate.test.sh`, the `pre-push-gate regression` step
# in ci.yml). Measured 2026-10-20: it takes about 2m45s here — each of the three
# fixture repos costs ~16s of git, more than the whole rest of this gate — and it
# is the case that protects this script, so it belongs where that cost is free. A
# hook slow enough to be worth bypassing is a hook nobody runs.
#
# Usage:  sh agent/scripts/pre-push-gate.sh
# Exit:   0  every check passed — the push proceeds
#         1  at least one check failed — the push is refused
#
# ESCAPE. `git push --no-verify` — git's own bypass, which skips every pre-push
# hook. Nothing here reads a private marker or an environment variable to switch
# itself off, so a bypass is always visible in the command that used it.
# `LEFTHOOK=0 git push` skips the lefthook layer as well. Neither is needed for a
# docs-only or backlog-only branch: those run the citation and ledger checks,
# which is the point (a backlog edit can break ledger-check).
#
# FAILS CLOSED. A missing interpreter, an unresolvable base, or a check that
# cannot start is a FAILED check, never a skipped one. The harness's fail-open
# rule governs what the agent CALLS mid-session — a hook that could block a tool
# call. This is a gate, and a gate that cannot run must not read as a pass.
set -u

# ─── neutralise the hook environment FIRST ────────────────────────────────────
#
# Git exports `GIT_DIR` into a hook's environment when the push comes from a
# LINKED WORKTREE, and a `GIT_DIR` in the environment beats `git -C <dir>`: every
# nested git command then acts on THIS repository instead of the directory it
# names. Measured 2026-10-20, on this gate's first end-to-end run: the guard
# suites create their own throwaway repos under a temp directory, and from a
# worktree push those repos were silently redirected onto the harness repo —
# fixture commits landed on real branches, `git init --bare` in a fixture set
# `core.bare=true` in the shared config, and the working tree was switched to a
# fixture branch. None of that happens when the same suites are run by hand,
# because a hand-run shell has no `GIT_DIR`.
#
# So the leak is cleared before anything else runs, which restores exactly the
# environment the checks are known-good in. `GIT_INDEX_FILE` and the object-store
# overrides are cleared with it: each one redirects part of a git invocation the
# same way.
unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "pre-push-gate: not inside a git working tree — cannot run, refusing" >&2
  exit 1
}
cd "$repo_root" || exit 1

# Every git command below names the repository explicitly (`-C "$repo_root"`)
# rather than trusting the working directory, and the first thing done with that
# path is an assertion that git agrees it is the repository this run is about.
# A gate that quietly operated on a different repository is the exact failure the
# note above describes, and this makes it a refusal instead.
resolved="$(git -C "$repo_root" rev-parse --show-toplevel 2>/dev/null || true)"
if [ "$resolved" != "$repo_root" ]; then
  echo "pre-push-gate: '$repo_root' resolves to '${resolved:-nothing}' — cannot run, refusing" >&2
  exit 1
fi

for script in \
  agent/scripts/ledger-check.sh \
  agent/scripts/rule-frontmatter-check.py \
  agent/scripts/skill-root-check.py \
  agent/scripts/mirror-config.sh
do
  [ -f "$script" ] || {
    echo "pre-push-gate: $script is missing from $repo_root — cannot run, refusing" >&2
    exit 1
  }
done

log_dir="$(mktemp -d)" || {
  echo "pre-push-gate: cannot create a log directory — cannot run, refusing" >&2
  exit 1
}
# The mirror gate reads a tag, so one is made for the run and always removed —
# including on a failure or an interrupt. A unique name, so two pushes at once
# (two worktrees) cannot collide on it.
mirror_tag="prepush-gate-$$"
keep_logs=0
cleanup() {
  git -C "$repo_root" tag -d "$mirror_tag" >/dev/null 2>&1 || true
  [ "$keep_logs" = "1" ] || rm -rf "$log_dir"
}
trap cleanup EXIT INT TERM

checks=0
passed=0
failures=""

# `need <tool>` — a check whose interpreter is absent FAILS. `command -v` is the
# POSIX spelling; exit 127 from the check itself would say "command not found"
# only in the log.
need() {
  command -v "$1" >/dev/null 2>&1 && return 0
  echo "'$1' is not on PATH, so this check cannot run — which counts as a failure"
  return 1
}

# `command -v bash` is not enough on this machine. Git for Windows ships a real
# bash, and Windows ships a stub at C:\WINDOWS\system32\bash.exe that only works
# when WSL has a distribution installed — measured 2026-10-20, `bash --version`
# from the stub dies with "WSL … execvpe(/bin/bash) failed". Both scripts that
# need bash use arrays, so a stub is not a substitute. This proves the bash it
# found actually runs one, and names it when it does not, instead of leaving the
# WSL error as the only explanation in a log.
need_bash() {
  need bash || return 1
  bash -c 'exit 0' >/dev/null 2>&1 && return 0
  echo "'bash' resolves to '$(command -v bash)', which cannot run a script — this check cannot run, which counts as a failure"
  return 1
}

# run_check <label> <command…> — run it, report one line, keep the log.
run_check() {
  label="$1"
  shift
  checks=$((checks + 1))
  log="$log_dir/$checks.log"
  printf 'pre-push-gate: [%s] %s … ' "$checks" "$label"
  started="$(date +%s)"
  "$@" >"$log" 2>&1
  rc=$?
  took=$(( $(date +%s) - started ))
  if [ "$rc" -eq 0 ]; then
    passed=$((passed + 1))
    printf 'ok (%ss)\n' "$took"
    return 0
  fi
  printf 'FAIL (%ss, exit %s)\n' "$took" "$rc"
  failures="$failures
  - $label (exit $rc, log $log)"
  # The failing line if the check names one (a guard suite does), else enough of
  # the log to say why. An empty log is itself the finding, so it is stated.
  if grep -q '^FAIL ' "$log" 2>/dev/null; then
    grep '^FAIL ' "$log" | sed 's/^/      /'
  elif [ -s "$log" ]; then
    tail -n 25 "$log" | sed 's/^/      | /'
  else
    echo "      (the check printed nothing and exited $rc)"
  fi
  keep_logs=1
  return 1
}

# ─── the checks, in ci.yml's order ────────────────────────────────────────────

check_ledger() {
  need_bash || return 1
  bash agent/scripts/ledger-check.sh
}

check_rule_frontmatter() {
  need uv || return 1
  # The script defaults to ~/.omp/agent/rules; the checkout's own rules are
  # passed explicitly so the gate is about the tree being pushed.
  uv run --no-project --with pyyaml python agent/scripts/rule-frontmatter-check.py agent/rules
}

check_skill_root() {
  need uv || return 1
  uv run --no-project python agent/scripts/skill-root-check.py
}

check_mirror_gate() {
  need_bash || return 1
  # A tag left by a run that was killed outright (SIGKILL takes no trap) would
  # make `git tag` fail with "already exists"; drop it first, then make ours.
  git -C "$repo_root" tag -d "$mirror_tag" >/dev/null 2>&1 || true
  git -C "$repo_root" tag "$mirror_tag" HEAD || return 1
  # --dry-run stages and gates without a commit or a push, so no key and no
  # identity are needed; it scans the tag's tree, which is this push's tip.
  bash agent/scripts/mirror-config.sh "$mirror_tag" --dry-run
}

check_guard_suites() {
  need bun || return 1
  found=0
  bad=0
  # SEQUENTIALLY, and one suite at a time: `guard-e2e-real-git.test.ts` is
  # concurrency-unsafe (it writes fixed paths under ~), so a parallel run is a
  # false failure waiting to happen. Every suite runs even when an earlier one
  # failed, so one red does not hide the others.
  for suite in agent/hooks/pre/__tests__/*.test.ts; do
    [ -f "$suite" ] || continue
    found=$((found + 1))
    if bun "$suite"; then
      echo "PASS $suite"
    else
      echo "FAIL $suite"
      bad=$((bad + 1))
    fi
  done
  if [ "$found" -eq 0 ]; then
    echo "no *.test.ts under agent/hooks/pre/__tests__ — the suites cannot run, which counts as a failure"
    return 1
  fi
  echo "$found suite(s) run, $bad failed"
  [ "$bad" -eq 0 ]
}

started_all="$(date +%s)"
run_check "ledger-check" check_ledger
run_check "rule-frontmatter-check" check_rule_frontmatter
run_check "skill-root-check" check_skill_root
run_check "mirror gate" check_mirror_gate
run_check "guard suites" check_guard_suites
elapsed=$(( $(date +%s) - started_all ))

echo
if [ "$passed" -eq "$checks" ]; then
  echo "pre-push-gate: $passed/$checks checks passed in ${elapsed}s — push allowed"
  exit 0
fi

echo "pre-push-gate: REFUSING the push — $((checks - passed)) of $checks checks failed in ${elapsed}s:" >&2
printf '%s\n' "$failures" >&2
echo "  Fix them, or bypass the hook with git's own escape: git push --no-verify" >&2
echo "  Full logs: $log_dir" >&2
exit 1
