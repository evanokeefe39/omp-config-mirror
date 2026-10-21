#!/usr/bin/env sh
#
# check-verifier-ran.test.sh — the check can go red, and names what it caught.
#
#   sh agent/scripts/tests/check-verifier-ran.test.sh [path/to/check_verifier_ran.py]
#
# WHY THIS EXISTS. `check_verifier_ran.py` exists to catch a silent failure: a
# trial whose verifier never executed a test scores 0 for a platform reason and
# is indistinguishable, in `result.json`, from an agent that answered wrongly. A
# check that cannot go red cannot catch it, and a check that goes red without
# naming the trial sends the reader back to `result.json` to guess. So every case
# below asserts BOTH the exit status AND that the offending trial is named.
#
# The fixtures are throwaway directories shaped like a harbor run dir; nothing
# outside the temp directory is read or written, and no case needs the network.
#
# CASES
#   1 clean          — every trial ran a test -> exit 0.
#   2 zero-total     — a trial whose verifier ran no test -> exit 1, named.
#   3 no-verifier    — a trial that never reached the verifier -> exit 1, named.
#   4 no-count-line  — verifier output with no test count in it -> exit 1, named.
#   5 last-wins      — two count lines, the LAST one zero -> exit 1. A verifier
#                      that runs dbt twice prints the line twice; the final one is
#                      what the reward came from, so it is the one that counts.
#   6 empty-run      — a run dir with no trials -> exit 1, not a vacuous pass.
#   7 missing-dir    — a path that is not a run dir -> exit 2 (usage error).
#
# Prints `ok <case> — <what>` / `FAIL <case>: <why>` per assertion and a final
# `<passed>/<total> passed`; any FAIL exits 1.
set -u

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"
CHECK="${1:-$TESTS_DIR/../check_verifier_ran.py}"
ROOT="$(cd "$TESTS_DIR/../../.." && pwd)"

PASS=0
FAILED=0
CASE=""

begin_case() {
  CASE="$1"
  printf '\n--- %s\n' "$CASE"
}

ok() {
  PASS=$((PASS + 1))
  printf 'ok %s — %s\n' "$CASE" "$1"
}

fail() {
  FAILED=$((FAILED + 1))
  printf 'FAIL %s: %s\n' "$CASE" "$1"
}

eq() {
  if [ "$2" = "$3" ]; then
    ok "$1"
  else
    fail "$1 (want [$3], got [$2])"
  fi
}

# run <run-dir> -> stdout in $OUT, status in $RC
run_check() {
  OUT="$(cd "$ROOT" && uv run --no-project python "$CHECK" "$1" 2>&1)"
  RC=$?
}

# A trial directory whose verifier printed a given final count.
trial_with_total() {
  _dir="$1/$(basename "$2")"
  mkdir -p "$_dir/verifier"
  printf 'irrelevant preamble\n[ade-bench] actual_test_total=%s, actual_pass=%s, actual_fail=0\n' "$3" "$3" \
    >"$_dir/verifier/test-stdout.txt"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ─── 1 clean ────────────────────────────────────────────────────────────────
begin_case clean
R1="$TMP/clean"
trial_with_total "$R1" trial-a 4
trial_with_total "$R1" trial-b 1
run_check "$R1"
eq "all trials ran a test -> exit 0" "$RC" "0"

# ─── 2 zero-total ───────────────────────────────────────────────────────────
begin_case zero-total
R2="$TMP/zero"
trial_with_total "$R2" trial-good 4
trial_with_total "$R2" trial-nineteen 0
run_check "$R2"
eq "a trial that ran no test -> exit 1" "$RC" "1"
case "$OUT" in
  *trial-nineteen*) ok "the offending trial is named" ;;
  *) fail "the offending trial is not named in the output" ;;
esac
case "$OUT" in
  *trial-good*) fail "a healthy trial was reported as failing" ;;
  *) ok "the healthy trial is not reported" ;;
esac

# ─── 3 no-verifier ──────────────────────────────────────────────────────────
begin_case no-verifier
R3="$TMP/noverifier"
trial_with_total "$R3" trial-good 2
mkdir -p "$R3/trial-stalled/agent"
run_check "$R3"
eq "a trial with no verifier output -> exit 1" "$RC" "1"
case "$OUT" in
  *trial-stalled*) ok "the stalled trial is named" ;;
  *) fail "the stalled trial is not named" ;;
esac

# ─── 4 no-count-line ────────────────────────────────────────────────────────
begin_case no-count-line
R4="$TMP/nocount"
mkdir -p "$R4/trial-404/verifier"
printf 'ERROR: 404 Not Found for package\n' >"$R4/trial-404/verifier/test-stdout.txt"
run_check "$R4"
eq "verifier output with no test count -> exit 1" "$RC" "1"
case "$OUT" in
  *trial-404*) ok "the trial is named" ;;
  *) fail "the trial is not named" ;;
esac

# ─── 5 last-wins ────────────────────────────────────────────────────────────
begin_case last-wins
R5="$TMP/lastwins"
mkdir -p "$R5/trial-twice/verifier"
printf '[ade-bench] actual_test_total=3, actual_pass=3, actual_fail=0\n[ade-bench] actual_test_total=0, actual_pass=0, actual_fail=0\n' \
  >"$R5/trial-twice/verifier/test-stdout.txt"
run_check "$R5"
eq "the LAST count line decides -> exit 1" "$RC" "1"

# ─── 6 empty-run ────────────────────────────────────────────────────────────
begin_case empty-run
R6="$TMP/empty"
mkdir -p "$R6"
run_check "$R6"
eq "a run dir with no trials -> exit 1, not a vacuous pass" "$RC" "1"

# ─── 7 missing-dir ──────────────────────────────────────────────────────────
begin_case missing-dir
run_check "$TMP/does-not-exist"
eq "a path that is not a run dir -> exit 2" "$RC" "2"

printf '\n%s/%s passed\n' "$PASS" "$((PASS + FAILED))"
[ "$FAILED" -eq 0 ] || exit 1
