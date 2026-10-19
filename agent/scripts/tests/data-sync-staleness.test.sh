#!/usr/bin/env sh
#
# data-sync-staleness.test.sh — the staleness sensor's contract, asserted against a
# throwaway fixture.
#
#   sh agent/scripts/tests/data-sync-staleness.test.sh [path/to/data-sync-staleness.sh]
#
# Every case builds its own repo root plus its own fake evidence directory under one
# mktemp -d, copies the script into `<root>/agent/scripts/` — the path it derives the
# repo root from, so the marker and the state file land where production puts them —
# and drives it with DATA_SYNC_DIR pointed at the fake evidence. Two cases drive it
# the way production does instead, with no pinned directory: DATA_SYNC_REPOS_ROOT
# points at a fake repos root and the record is found by name. Nothing outside that
# temp directory is touched: the live checkouts under ~/repos are never read, and no
# case needs the network or the real daily job.
#
# WHAT IT ASSERTS: the state the sensor reaches and the exit code it reaches it with
# (ok 0 · stale/red 1 · unknown 2); that the window is the named threshold and not
# some other age (the 35h/37h boundary pair); that a missing, unparsable or
# flag-less status file is unknown and never ok; that the record is found by name
# under the repos root when nothing is pinned, with the newest `ran_at` winning; that
# a fresh run whose own mirror check went red is not read as healthy by an age check
# alone; that the marker is written on every red and removed on green; that `status`
# writes nothing; and that `omp-git-sync.sh` turns a red sensor into exit 4 while
# still reporting its own run.
#
# WHAT IT DOES NOT: that the daily task runs, that Task Scheduler carries exit 4, or
# that anything reads the state file — the last is a FEEDBACK row, not a check.
#
# Prints `ok <case> — <what>` / `FAIL <case>: <why>` per assertion and a final
# `<passed>/<total> passed`; any FAIL exits 1.
set -u

FIXTURE_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_UNDER_TEST="${1:-$FIXTURE_DIR/../data-sync-staleness.sh}"
if [ ! -f "$SCRIPT_UNDER_TEST" ]; then
  printf 'data-sync-staleness.test: no script under test at %s\n' "$SCRIPT_UNDER_TEST" >&2
  exit 2
fi
SCRIPT_UNDER_TEST="$(cd "$(dirname "$SCRIPT_UNDER_TEST")" && pwd)/$(basename "$SCRIPT_UNDER_TEST")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAILED=0; CASE_FAILS=0
REPO=""; DATA=""; WINDOW=""; OUT=""; RC=0

printf 'data-sync-staleness.test.sh\nscript under test: %s\n  blob %s\n\n' \
  "$SCRIPT_UNDER_TEST" "$(git hash-object "$SCRIPT_UNDER_TEST" 2>/dev/null || echo '(not a git object)')"

ok()  { PASS=$((PASS + 1)); printf 'ok   %s — %s\n' "$1" "$2"; }
bad() { FAILED=$((FAILED + 1)); CASE_FAILS=$((CASE_FAILS + 1)); printf 'FAIL %s: %s\n' "$1" "$2"; }
assert_that() { if [ -z "$3" ]; then ok "$1" "$2"; else bad "$1" "$2 — $3"; fi; }
eq() { if [ "$3" = "$4" ]; then ok "$1" "$2"; else bad "$1" "$2 — expected [$3], got [$4]"; fi; }

begin_case() { CASE_FAILS=0; }
end_case() {
  local C="$1"
  [ "$CASE_FAILS" -gt 0 ] || return 0
  printf '     ── %s: sensor output (exit %s) ──\n' "$C" "$RC"
  [ -z "$OUT" ] || printf '%s\n' "$OUT" | sed 's/^/     | /'
}

# --- fixture ----------------------------------------------------------------

# make_fixture <case>: a repo root with the script at the path it derives itself
# from, an empty fake evidence directory beside it, and an empty fake repos root for
# the cases that let the script find the record by name.
make_fixture() {
  local base="$TMP/$1"
  REPO="$base/repo"
  DATA="$base/data"
  REPOS_ROOT="$base/repos"
  WINDOW=""
  mkdir -p "$REPO/agent/scripts" "$DATA/usage" "$REPOS_ROOT"
  cp "$SCRIPT_UNDER_TEST" "$REPO/agent/scripts/data-sync-staleness.sh"
}

stamp_hours_ago() { date -u -d "@$(( $(date +%s) - $1 * 3600 ))" '+%Y-%m-%dT%H:%M:%SZ'; }

# evidence_in <dir> <age_hours> <ok true|false> [red_count] — a completed run of that
# age, with the mirror verdict it left behind.
evidence_in() {
  local dir="$1" age="$2" ok="$3" reds="${4:-0}" ts
  ts="$(stamp_hours_ago "$age")"
  mkdir -p "$dir/usage"
  printf '{"ok": %s, "ran_at": "%s", "red_count": %s, "warn_count": 1}\n' \
    "$ok" "$ts" "$reds" > "$dir/r2-mirror-status.json"
  printf '{"extracted_at": "%s"}\n' "$ts" > "$dir/usage/meta.json"
}
evidence() { evidence_in "$DATA" "$@"; }

# run_sensor [args...]: the sensor in this fixture's repo, with DATA_SYNC_DIR pointed
# at the fake evidence. DATA_SYNC_REPO is deliberately NOT set: the repo root has to
# come from the script's own location, which is what production relies on.
run_sensor() {
  if [ -n "$WINDOW" ]; then
    OUT="$( DATA_SYNC_DIR="$DATA" DATA_SYNC_STALE_AFTER_HOURS="$WINDOW" sh "$REPO/agent/scripts/data-sync-staleness.sh" "$@" 2>&1 )"
  else
    OUT="$( DATA_SYNC_DIR="$DATA" sh "$REPO/agent/scripts/data-sync-staleness.sh" "$@" 2>&1 )"
  fi
  RC=$?
}

# run_sensor_discovered [args...]: the production path — nothing pinned, the record
# found by name under the fake repos root.
run_sensor_discovered() {
  OUT="$( DATA_SYNC_REPOS_ROOT="$REPOS_ROOT" sh "$REPO/agent/scripts/data-sync-staleness.sh" "$@" 2>&1 )"
  RC=$?
}

STATE_FILE="$TMP/unset"; MARKER="$TMP/unset"
state_field() { # state_field <file> <key>
  [ -f "$1" ] || return 0
  sed -n "s/^[[:space:]]*\"$2\"[[:space:]]*:[[:space:]]*//p" "$1" | head -n 1 \
    | sed -e 's/,$//' -e 's/^"//' -e 's/"$//'
}
point_at_fixture() { STATE_FILE="$REPO/data-sync-status.json"; MARKER="$REPO/DATA-SYNC-STALE"; }
marker_state() { [ -f "$MARKER" ] && echo present || echo absent; }

# --- cases ------------------------------------------------------------------

# Case 1 — a run that completed inside the window, green, is ok and leaves no marker.
case_fresh_green_is_ok() {
  local C=fresh_green_is_ok
  begin_case
  make_fixture "$C"; point_at_fixture
  evidence 7 true
  run_sensor
  eq "$C" "exit code" 0 "$RC"
  eq "$C" "state in the state file" "ok" "$(state_field "$STATE_FILE" state)"
  eq "$C" "the state file is written at the repo root" "ok" \
    "$([ -f "$STATE_FILE" ] && echo ok || echo 'no state file')"
  eq "$C" "marker (green clears it)" "absent" "$(marker_state)"
  assert_that "$C" "the report says ok" \
    "$(printf '%s' "$OUT" | grep -q '^data-sync: ok' || echo "the report does not say ok: $(printf '%s' "$OUT" | head -n 1)")"
  end_case "$C"
}

# Case 2 — the failure the sensor exists for: a job that stopped running. 41 h is
# past the window, so this is the red case the VERIFY row names.
case_stale_run_is_red() {
  local C=stale_run_is_red
  begin_case
  make_fixture "$C"; point_at_fixture
  evidence 41 true
  run_sensor
  eq "$C" "exit code" 1 "$RC"
  eq "$C" "state in the state file" "stale" "$(state_field "$STATE_FILE" state)"
  eq "$C" "marker" "present" "$(marker_state)"
  assert_that "$C" "the report says STALE and names the age" \
    "$(printf '%s' "$OUT" | grep -q '^data-sync: STALE — no completed data sync in 41' || echo 'no STALE line with the age')"
  assert_that "$C" "the marker names the state" \
    "$(grep -q '^state=stale$' "$MARKER" || echo "the marker does not carry state=stale")"
  assert_that "$C" "the state file records the age" \
    "$(state_field "$STATE_FILE" age_hours | grep -q '^41' || echo "age_hours is not 41: $(state_field "$STATE_FILE" age_hours)")"
  end_case "$C"
}

# Case 3 — the window is 36 h, not something near it. 35 h is inside, 37 h is not:
# a sensor that reds on any missed day would be noise, and one that tolerates three
# days would be blind, so the boundary is asserted from both sides.
case_window_boundary_is_36h() {
  local C=window_boundary_is_36h
  begin_case
  make_fixture "$C"; point_at_fixture
  evidence 35 true
  run_sensor
  eq "$C" "35h is inside the window" 0 "$RC"
  eq "$C" "state at 35h" "ok" "$(state_field "$STATE_FILE" state)"
  evidence 37 true
  run_sensor
  eq "$C" "37h is outside the window" 1 "$RC"
  eq "$C" "state at 37h" "stale" "$(state_field "$STATE_FILE" state)"
  end_case "$C"
}

# Case 4 — the case a never-started job produces: no completion record at all, while
# the extract step's own file is fresh. It must be red (unknown), never ok, and the
# report has to name what it looked for.
case_missing_record_is_unknown_not_ok() {
  local C=missing_record_is_unknown_not_ok
  begin_case
  make_fixture "$C"; point_at_fixture
  printf '{"extracted_at": "%s"}\n' "$(stamp_hours_ago 1)" > "$DATA/usage/meta.json"
  rm -f "$DATA/r2-mirror-status.json"
  run_sensor
  eq "$C" "exit code" 2 "$RC"
  eq "$C" "state in the state file" "unknown" "$(state_field "$STATE_FILE" state)"
  eq "$C" "marker" "present" "$(marker_state)"
  assert_that "$C" "the report says UNKNOWN" \
    "$(printf '%s' "$OUT" | grep -q '^data-sync: UNKNOWN' || echo 'the report does not say UNKNOWN')"
  assert_that "$C" "the report never says ok" \
    "$(printf '%s' "$OUT" | grep -q '^data-sync: ok' && echo 'a report with no completion record called itself ok')"
  assert_that "$C" "the report names the path it looked for" \
    "$(printf '%s' "$OUT" | grep -q 'r2-mirror-status.json' || echo 'the evidence path is not named')"
  end_case "$C"
}

# Case 5 — a status file that is not JSON. Same verdict as missing: unreadable is
# not fine.
case_unparsable_record_is_unknown() {
  local C=unparsable_record_is_unknown
  begin_case
  make_fixture "$C"; point_at_fixture
  printf 'not json at all\n' > "$DATA/r2-mirror-status.json"
  run_sensor
  eq "$C" "exit code" 2 "$RC"
  eq "$C" "state in the state file" "unknown" "$(state_field "$STATE_FILE" state)"
  assert_that "$C" "the report says the file is not readable JSON" \
    "$(printf '%s' "$OUT" | grep -q 'not readable JSON' || echo 'the report does not name the parse failure')"
  end_case "$C"
}

# Case 6 — a run that completed minutes ago and whose own mirror check went red. An
# age check alone calls this healthy: the job ran, recently, and failed. It is the
# one case where recency and health disagree, so it gets its own state.
case_fresh_but_red_mirror_is_not_ok() {
  local C=fresh_but_red_mirror_is_not_ok
  begin_case
  make_fixture "$C"; point_at_fixture
  evidence 2 false 2
  run_sensor
  eq "$C" "exit code" 1 "$RC"
  eq "$C" "state in the state file" "failed" "$(state_field "$STATE_FILE" state)"
  eq "$C" "marker" "present" "$(marker_state)"
  assert_that "$C" "the report says RED and names the red count" \
    "$(printf '%s' "$OUT" | grep -q '^data-sync: RED — .*2 red(s)' || echo 'no RED line with the red count')"
  assert_that "$C" "the report never says ok" \
    "$(printf '%s' "$OUT" | grep -q '^data-sync: ok' && echo 'a red mirror was reported as ok')"
  end_case "$C"
}

# Case 7 — recovery: the next green run takes the marker away, and the state file
# stops saying stale. A marker nobody clears is a light left on.
case_green_clears_the_marker() {
  local C=green_clears_the_marker
  begin_case
  make_fixture "$C"; point_at_fixture
  evidence 41 true
  run_sensor
  eq "$C" "the stale run left a marker" "present" "$(marker_state)"
  evidence 1 true
  run_sensor
  eq "$C" "exit code after recovery" 0 "$RC"
  eq "$C" "the marker is gone" "absent" "$(marker_state)"
  eq "$C" "state after recovery" "ok" "$(state_field "$STATE_FILE" state)"
  end_case "$C"
}

# Case 8 — `status` is an inspector: it reports and changes nothing, including a
# marker another run left behind.
case_status_mode_writes_nothing() {
  local C=status_mode_writes_nothing before
  begin_case
  make_fixture "$C"; point_at_fixture
  evidence 41 true
  run_sensor status
  eq "$C" "exit code (the verdict still travels)" 1 "$RC"
  eq "$C" "status wrote no state file" "absent" \
    "$([ -f "$STATE_FILE" ] && echo present || echo absent)"
  eq "$C" "status wrote no marker" "absent" "$(marker_state)"
  assert_that "$C" "status printed a report" "$([ -n "$OUT" ] || echo 'it printed nothing')"
  # A marker an earlier run left must survive a status run untouched.
  evidence 41 true
  run_sensor
  before="$(cat "$MARKER")"
  evidence 1 true
  run_sensor status
  eq "$C" "status left the stale marker alone" "$before" "$(cat "$MARKER")"
  end_case "$C"
}

# Case 9 — the window is a named constant, not a literal in the comparison: an
# override has to move it.
case_window_override_moves_the_boundary() {
  local C=window_override_moves_the_boundary
  begin_case
  make_fixture "$C"; point_at_fixture
  evidence 2 true
  WINDOW=1
  run_sensor
  eq "$C" "exit code with a 1h window" 1 "$RC"
  eq "$C" "state with a 1h window" "stale" "$(state_field "$STATE_FILE" state)"
  eq "$C" "the state file records the window in force" "1" "$(state_field "$STATE_FILE" stale_after_hours)"
  end_case "$C"
}

# Case 10 — a record with a timestamp but no verdict. The run's outcome cannot be
# read, so it is unknown: defaulting a missing flag to green is how a red mirror
# would hide.
case_missing_ok_flag_is_unknown() {
  local C=missing_ok_flag_is_unknown
  begin_case
  make_fixture "$C"; point_at_fixture
  printf '{"ran_at": "%s", "red_count": 0}\n' "$(stamp_hours_ago 1)" > "$DATA/r2-mirror-status.json"
  run_sensor
  eq "$C" "exit code" 2 "$RC"
  eq "$C" "state in the state file" "unknown" "$(state_field "$STATE_FILE" state)"
  assert_that "$C" "the report says the outcome cannot be read" \
    "$(printf '%s' "$OUT" | grep -q 'no ok flag' || echo 'the report does not name the missing flag')"
  end_case "$C"
}

# Case 11 — the integration. A red sensor has to reach the surface that does not
# depend on the daily data job, and reach it without claiming the harness's own sync
# failed: omp-git-sync.sh reports it as exit 4 (its exit 3 is unreviewed code, and 1
# is reserved for "this job could not do its job"). Asserted here rather than
# demonstrated by hand because it is the half the card is about — the machine saying
# it did not run.
case_integration_red_exits_4() {
  local C=integration_red_exits_4 SYNC
  begin_case
  make_fixture "$C"; point_at_fixture
  SYNC="$FIXTURE_DIR/../omp-git-sync.sh"
  if [ ! -f "$SYNC" ]; then
    bad "$C" "the sync script sits beside this suite" "not found at $SYNC — the two ship together"
    end_case "$C"; return 0
  fi
  cp "$SYNC" "$REPO/agent/scripts/omp-git-sync.sh"
  mkdir -p "$REPO/agent/docs"
  printf '# seed ledger\n' > "$REPO/agent/DEFECTS.md"
  # Hermetic, as the sync's own suite is: this machine's global core.hooksPath,
  # autocrlf and gpgsign must not decide what the fixture's commit does.
  ( cd "$REPO" && git init -q && git symbolic-ref HEAD refs/heads/main \
    && git config user.email t@t && git config user.name t \
    && git config commit.gpgsign false && git config core.hooksPath "$REPO/.no-hooks" \
    && git config core.autocrlf false && git add -A \
    && git commit -q -m "chore(seed): the fixture's first commit" ) >/dev/null 2>&1
  evidence 41 true
  OUT="$( cd "$REPO" && DATA_SYNC_DIR="$DATA" "${BASH:-bash}" agent/scripts/omp-git-sync.sh 2>&1 )"
  RC=$?
  eq "$C" "exit code (a red sensor reaches Task Scheduler's Last Result)" 4 "$RC"
  eq "$C" "marker" "present" "$(marker_state)"
  assert_that "$C" "the sync's report carries the sensor's own line" \
    "$(printf '%s' "$OUT" | grep -q '^data-sync: STALE' || echo 'the sync report does not carry the sensor line')"
  assert_that "$C" "the sync's own report still claims its own success" \
    "$(printf '%s' "$OUT" | grep -q '^last:.*(success)' || echo 'the sync report does not carry its own success line')"
  evidence 1 true
  OUT="$( cd "$REPO" && DATA_SYNC_DIR="$DATA" "${BASH:-bash}" agent/scripts/omp-git-sync.sh 2>&1 )"
  RC=$?
  eq "$C" "exit code after recovery" 0 "$RC"
  eq "$C" "marker after recovery" "absent" "$(marker_state)"
  end_case "$C"
}

# Case 12 — the path production takes: nothing pinned, exactly one record, found by
# name. It has to be found, because the sibling repo is private and `agent/scripts`
# is on the config mirror's allow-list: a literal path here made the mirror gate
# refuse its own tree (34 hits, measured 2026-10-19).
case_discovery_finds_the_single_record_by_name() {
  local C=discovery_finds_the_single_record_by_name
  begin_case
  make_fixture "$C"; point_at_fixture
  evidence_in "$REPOS_ROOT/the-checkout" 3 true
  run_sensor_discovered
  eq "$C" "exit code" 0 "$RC"
  eq "$C" "state in the state file" "ok" "$(state_field "$STATE_FILE" state)"
  eq "$C" "records seen" "1" "$(state_field "$STATE_FILE" records_seen)"
  assert_that "$C" "the report names the discovered record" \
    "$(printf '%s' "$OUT" | grep -q 'the-checkout.*r2-mirror-status.json' || echo "the evidence is not the discovered record: $(printf '%s' "$OUT" | head -n 2 | tail -n 1)")"
  assert_that "$C" "the corroborating file is read beside the discovered record" \
    "$(printf '%s' "$OUT" | grep -q 'usage/meta.json extracted 3' || echo "the extract age does not match the discovered record")"
  # The path is written into JSON: a raw backslash would either break the parse or
  # (after the stripper) silently corrupt the path, so it is folded to a slash.
  assert_that "$C" "the state file's evidence path holds no backslash" \
    "$(case "$(state_field "$STATE_FILE" evidence)" in *'\'*) echo "evidence is not folded: $(state_field "$STATE_FILE" evidence)";; esac)"
  end_case "$C"
}

# Case 13 — two records and nothing pinned. Guessing (the fresher one) would report a
# green over a stalled job: the whole failure this sensor exists for. It fails closed,
# names both candidates, and says how to pin the right one.
case_discovery_with_two_records_fails_closed() {
  local C=discovery_with_two_records_fails_closed
  begin_case
  make_fixture "$C"; point_at_fixture
  evidence_in "$REPOS_ROOT/other-checkout" 1 true
  evidence_in "$REPOS_ROOT/the-checkout" 41 true
  run_sensor_discovered
  eq "$C" "exit code" 2 "$RC"
  eq "$C" "state in the state file" "unknown" "$(state_field "$STATE_FILE" state)"
  eq "$C" "records seen" "2" "$(state_field "$STATE_FILE" records_seen)"
  eq "$C" "marker" "present" "$(marker_state)"
  assert_that "$C" "the report names both candidates" \
    "$(printf '%s' "$OUT" | grep -q 'other-checkout.*the-checkout' || echo "the candidates are not both named: $(printf '%s' "$OUT" | sed -n 3p)")"
  assert_that "$C" "the report says to pin DATA_SYNC_DIR" \
    "$(printf '%s' "$OUT" | grep -q 'DATA_SYNC_DIR' || echo 'the report does not say how to pin the record')"
  assert_that "$C" "the fresher record does not make it green" \
    "$(printf '%s' "$OUT" | grep -q '^data-sync: ok' && echo 'a shadowed stale record was reported as ok')"
  end_case "$C"
}

# Case 14 — discovery finds nothing: the machine has no record to read. That is
# unknown (red), and the report names the search it made rather than a path nobody
# can check.
case_discovery_with_no_record_is_unknown() {
  local C=discovery_with_no_record_is_unknown
  begin_case
  make_fixture "$C"; point_at_fixture
  run_sensor_discovered
  eq "$C" "exit code" 2 "$RC"
  eq "$C" "state in the state file" "unknown" "$(state_field "$STATE_FILE" state)"
  eq "$C" "marker" "present" "$(marker_state)"
  assert_that "$C" "the report names the search" \
    "$(printf '%s' "$OUT" | grep -q 'r2-mirror-status.json (0 match(es))' || echo "the search is not named: $(printf '%s' "$OUT" | sed -n 2p)")"
  assert_that "$C" "the report never says ok" \
    "$(printf '%s' "$OUT" | grep -q '^data-sync: ok' && echo 'a report with no completion record called itself ok')"
  end_case "$C"
}

# Case 15 — dirty CODE (exit 3) and a red sensor together. Exit 3 wins, because one
# run carries one report code and the local edit is the one only this machine knows
# about — but the sensor's own delivery (the state file and the marker) is written
# regardless, so the stall is still visible in a listing of ~/.omp.
case_dirty_code_and_red_sensor_both_visible() {
  local C=dirty_code_and_red_sensor_both_visible SYNC
  begin_case
  make_fixture "$C"; point_at_fixture
  SYNC="$FIXTURE_DIR/../omp-git-sync.sh"
  if [ ! -f "$SYNC" ]; then
    bad "$C" "the sync script sits beside this suite" "not found at $SYNC — the two ship together"
    end_case "$C"; return 0
  fi
  cp "$SYNC" "$REPO/agent/scripts/omp-git-sync.sh"
  mkdir -p "$REPO/agent/docs"
  printf '# seed ledger\n' > "$REPO/agent/DEFECTS.md"
  ( cd "$REPO" && git init -q && git symbolic-ref HEAD refs/heads/main \
    && git config user.email t@t && git config user.name t \
    && git config commit.gpgsign false && git config core.hooksPath "$REPO/.no-hooks" \
    && git config core.autocrlf false && git add -A \
    && git commit -q -m "chore(seed): the fixture's first commit" ) >/dev/null 2>&1
  evidence 41 true
  printf '\n# an unreviewed local edit\n' >> "$REPO/agent/scripts/omp-git-sync.sh"
  OUT="$( cd "$REPO" && DATA_SYNC_DIR="$DATA" "${BASH:-bash}" agent/scripts/omp-git-sync.sh 2>&1 )"
  RC=$?
  eq "$C" "exit code (dirty CODE preempts the sensor's 4)" 3 "$RC"
  eq "$C" "the sensor's marker is still written" "present" "$(marker_state)"
  eq "$C" "the sensor's state file is still written" "stale" "$(state_field "$STATE_FILE" state)"
  assert_that "$C" "the report carries the sensor line" \
    "$(printf '%s' "$OUT" | grep -q '^data-sync: STALE' || echo 'the sync report does not carry the sensor line')"
  assert_that "$C" "the report carries the dirty-CODE line" \
    "$(printf '%s' "$OUT" | grep -qi 'unreviewed\|dirty' || echo 'the sync report does not carry its own exit-3 line')"
  end_case "$C"
}

# --- run --------------------------------------------------------------------

case_fresh_green_is_ok
case_stale_run_is_red
case_window_boundary_is_36h
case_missing_record_is_unknown_not_ok
case_unparsable_record_is_unknown
case_fresh_but_red_mirror_is_not_ok
case_green_clears_the_marker
case_status_mode_writes_nothing
case_window_override_moves_the_boundary
case_missing_ok_flag_is_unknown
case_integration_red_exits_4
case_discovery_finds_the_single_record_by_name
case_discovery_with_two_records_fails_closed
case_discovery_with_no_record_is_unknown
case_dirty_code_and_red_sensor_both_visible

total=$((PASS + FAILED))
printf '\n%d/%d passed\n' "$PASS" "$total"
[ "$FAILED" -eq 0 ] || exit 1
exit 0
