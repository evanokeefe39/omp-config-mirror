#!/usr/bin/env bash
#
# omp-git-sync.test.sh — the fetch-and-report contract, asserted against throwaway repos.
#
#   bash agent/scripts/tests/omp-git-sync.test.sh [path/to/omp-git-sync.sh]
#
# The script under test defaults to the one beside this fixture's directory, so the
# worktree's copy is what is tested unless another path is given (the pre-rewrite
# script, for the red run). Every case builds its own bare origin plus a working
# clone under one mktemp -d and copies the script in at agent/scripts/omp-git-sync.sh
# — the path it derives its repo root from — then drives it there. Nothing outside
# that temp directory is touched, and no case needs a network: each origin is a
# local bare repo, so a failing fetch is simulated by pointing origin at a path that
# does not exist.
#
# WHAT IT ASSERTS: exit codes; that HEAD and the remote's refs never move except by
# a fast-forward the contract asks for; that no commit is created and no commit
# message mentions sync; that a dirty tree survives; the sync-status.json fields the
# contract names; and the SYNC-STALLED marker on both failure paths — an origin it
# cannot reach, and a fast-forward whose autostash cannot be re-applied.
#
# WHAT IT DOES NOT: the wording of the human report, the deploy log, the identity
# hook line, or the status file's `last_failure`/`last_success` arithmetic beyond
# presence — those are the script's own documentation, not this contract.
#
# Prints `ok <case> — <what>` / `FAIL <case>: <why>` per assertion, the failing
# case's own run output, and a final `<passed>/<total> passed`; any FAIL exits 1.
set -uo pipefail

FIXTURE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_UNDER_TEST="${1:-$FIXTURE_DIR/../omp-git-sync.sh}"
if [ ! -f "$SCRIPT_UNDER_TEST" ]; then
  printf 'omp-git-sync.test: no script under test at %s\n' "$SCRIPT_UNDER_TEST" >&2
  exit 2
fi
SCRIPT_UNDER_TEST="$(cd "$(dirname "$SCRIPT_UNDER_TEST")" && pwd)/$(basename "$SCRIPT_UNDER_TEST")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAILED=0; CASE_FAILS=0
ORIGIN=""; WORK=""; PRE_HEAD=""; PRE_BRANCH=""; PRE_REFS=""; PRE_TRACKED=""; OUT=""; RC=0

printf 'omp-git-sync.test.sh\nscript under test: %s\n  blob %s\n\n' \
  "$SCRIPT_UNDER_TEST" "$(git hash-object "$SCRIPT_UNDER_TEST")"

# --- assertion plumbing -----------------------------------------------------

ok()  { PASS=$((PASS + 1)); printf 'ok   %s — %s\n' "$1" "$2"; }
bad() { FAILED=$((FAILED + 1)); CASE_FAILS=$((CASE_FAILS + 1)); printf 'FAIL %s: %s\n' "$1" "$2"; }

# assert_that <case> <what> <empty when the check holds, else why it does not>
assert_that() { if [ -z "$3" ]; then ok "$1" "$2"; else bad "$1" "$2 — $3"; fi; }

# eq <case> <what> <expected> <actual>
eq() { if [ "$3" = "$4" ]; then ok "$1" "$2"; else bad "$1" "$2 — expected [$3], got [$4]"; fi; }

begin_case() { CASE_FAILS=0; }

# A failing case prints what the script itself said: the exit code alone rarely
# shows which decision it took.
end_case() {
  local C="$1"
  [ "$CASE_FAILS" -gt 0 ] || return 0
  printf '     ── %s: run output (exit %s) ──\n' "$C" "$RC"
  [ -z "$OUT" ] || printf '%s\n' "$OUT" | sed 's/^/     | /'
}

# --- repo plumbing ----------------------------------------------------------

# make_repo <case>: a bare origin, a clone seeded with the script under test, and
# origin/main pushed. Everything the seed touches is committed, so no CODE path is
# dirty at the start of a case (a dirty CODE path exits 3 by design).
make_repo() {
  local base="$TMP/$1"
  ORIGIN="$base/origin.git"
  WORK="$base/work"
  mkdir -p "$WORK/agent/scripts" "$WORK/agent/docs" "$WORK/agent/skills/demo"
  git init --bare -q "$ORIGIN" 2>/dev/null
  git -C "$ORIGIN" symbolic-ref HEAD refs/heads/main
  git -C "$WORK" init -q 2>/dev/null
  git -C "$WORK" symbolic-ref HEAD refs/heads/main
  # Hermetic: this machine's global core.hooksPath and autocrlf must not decide a
  # temp repo's commits, or the same fixture answers differently per machine.
  git -C "$WORK" config user.email t@t
  git -C "$WORK" config user.name t
  git -C "$WORK" config commit.gpgsign false
  git -C "$WORK" config core.hooksPath "$WORK/.no-hooks"
  git -C "$WORK" config core.autocrlf false
  cp "$SCRIPT_UNDER_TEST" "$WORK/agent/scripts/omp-git-sync.sh"
  printf '# seed ledger\n' > "$WORK/agent/DEFECTS.md"
  printf '# seed docs\n'   > "$WORK/agent/docs/README.md"
  printf '# seed skill\n'  > "$WORK/agent/skills/demo/SKILL.md"
  git -C "$WORK" add -A
  git -C "$WORK" commit -q -m "chore(seed): the fixture's first commit"
  git -C "$WORK" remote add origin "$ORIGIN"
  git -C "$WORK" push -q -u origin main
}

# advance_origin <case> [path]: a second clone moves origin/main one commit on, so
# the case's own clone is behind it with a clean tree. The path defaults to the
# README; a case whose dirty file has to collide with the incoming commit names it.
advance_origin() {
  local other="$TMP/$1/other" path="${2:-agent/docs/README.md}"
  git clone -q "$ORIGIN" "$other" 2>/dev/null
  git -C "$other" config user.email t@t
  git -C "$other" config user.name t
  git -C "$other" config commit.gpgsign false
  git -C "$other" config core.hooksPath "$other/.no-hooks"
  git -C "$other" config core.autocrlf false
  printf '# the upstream moved on\n' >> "$other/$path"
  git -C "$other" add "$path"
  git -C "$other" commit -q -m "docs(seed): upstream moves $path on"
  git -C "$other" push -q origin main
}

origin_refs()    { git -C "$ORIGIN" for-each-ref --format='%(refname) %(objectname)' 2>/dev/null | sort; }
tracked_state()  { git -C "$WORK" status --porcelain --untracked-files=no | sort; }
head_after()     { git -C "$WORK" rev-parse HEAD 2>/dev/null || true; }
oneline()        { printf '%s' "$1" | tr '\n' ';'; }

# snapshot: everything a run must not move, recorded before it runs.
snapshot() {
  PRE_HEAD="$(head_after)"
  PRE_BRANCH="$(git -C "$WORK" symbolic-ref --short -q HEAD || true)"
  PRE_REFS="$(origin_refs)"
  PRE_TRACKED="$(tracked_state)"
}

# run_sync [args...]: run the script under test inside the temp repo, output captured.
# $BASH, not `bash`: on this machine `bash` on PATH resolves to WSL, and the script
# under test is a POSIX bash script that must run under the shell running this file.
run_sync() {
  OUT="$( cd "$WORK" && "${BASH:-bash}" agent/scripts/omp-git-sync.sh "$@" 2>&1 )"
  RC=$?
}

# --- shared assertions ------------------------------------------------------

check_head_unchanged() {
  local after; after="$(head_after)"
  assert_that "$1" "HEAD did not move" "$([ "$after" = "$PRE_HEAD" ] || echo "$PRE_HEAD -> $after")"
}

check_no_push() {
  local after; after="$(origin_refs)"
  assert_that "$1" "origin's refs are unchanged (nothing pushed)" \
    "$([ "$after" = "$PRE_REFS" ] || echo "$(oneline "$PRE_REFS") -> $(oneline "$after")")"
}

check_no_commit() {
  local hits; hits="$(git -C "$WORK" log --format=%s | grep -i 'sync' || true)"
  assert_that "$1" "no commit message mentions sync" "$([ -z "$hits" ] || echo "found: $(oneline "$hits")")"
}

# json_field <file> <key>: the value with quotes stripped, `null` for JSON null.
json_field() {
  [ -f "$1" ] || return 0
  sed -n "s/^[[:space:]]*\"$2\"[[:space:]]*:[[:space:]]*//p" "$1" | head -n 1 \
    | sed -e 's/,$//' -e 's/^"//' -e 's/"$//'
}

assert_keys() { # assert_keys <case> <file>: the 14 fields the contract names
  local missing="" k
  if [ ! -f "$2" ]; then bad "$1" "sync-status.json is missing — no keys to read"; return 0; fi
  for k in state last_run last_success last_failure last_error branch ahead behind behind_main \
           updated skip_reason dirty_code dirty_allow secrets_suspected; do
    grep -Eq "\"$k\"[[:space:]]*:" "$2" || missing="$missing $k"
  done
  assert_that "$1" "sync-status.json carries all 14 contract keys" "${missing:+missing:$missing}"
}

# Case 1 — a run creates no commit and pushes nothing, even with a dirty tree.
# This is the whole of the pre-rewrite script's job, and the reason for the rewrite.
case_no_commit_no_push() {
  local C=no_commit_no_push J
  begin_case
  make_repo "$C"; J="$WORK/sync-status.json"
  printf '# a hand edit\n' >> "$WORK/agent/DEFECTS.md"
  printf '# never committed\n' > "$WORK/agent/docs/new-note.md"
  snapshot
  run_sync
  eq "$C" "exit code" 0 "$RC"
  check_head_unchanged "$C"
  check_no_push "$C"
  check_no_commit "$C"
  assert_that "$C" "the modified file is still modified" \
    "$(git -C "$WORK" diff --quiet -- agent/DEFECTS.md && echo 'the file is clean — the run committed or reverted it')"
  assert_that "$C" "the untracked file is still untracked" \
    "$(git -C "$WORK" ls-files --error-unmatch agent/docs/new-note.md >/dev/null 2>&1 && echo 'it is tracked now — the run committed it')"
  assert_keys "$C" "$J"
  eq "$C" "sync-status.json state" "ok" "$(json_field "$J" state)"
  eq "$C" "sync-status.json skip_reason (nothing to do)" "current" "$(json_field "$J" skip_reason)"
  eq "$C" "sync-status.json updated" "false" "$(json_field "$J" updated)"
  end_case "$C"
}

# Case 2 — a branch that is not main is not this job's to advance.
case_feature_branch_skips() {
  local C=feature_branch_skips J
  begin_case
  make_repo "$C"; J="$WORK/sync-status.json"
  git -C "$WORK" checkout -q -b feature/wip
  printf '# wip\n' > "$WORK/agent/docs/wip-note.md"
  git -C "$WORK" add agent/docs/wip-note.md
  git -C "$WORK" commit -q -m "docs(seed): a note only this branch has"
  printf '# a hand edit on the wip branch\n' >> "$WORK/agent/DEFECTS.md"
  snapshot
  run_sync
  eq "$C" "exit code (a deliberate skip is not a failure)" 0 "$RC"
  eq "$C" "the branch is unchanged" "feature/wip" "$(git -C "$WORK" symbolic-ref --short -q HEAD)"
  check_head_unchanged "$C"
  check_no_push "$C"
  check_no_commit "$C"
  assert_that "$C" "the modified file is still modified" \
    "$(git -C "$WORK" diff --quiet -- agent/DEFECTS.md && echo 'the file is clean — the run committed or reverted it')"
  eq "$C" "sync-status.json branch" "feature/wip" "$(json_field "$J" branch)"
  eq "$C" "sync-status.json skip_reason" "branch-not-main" "$(json_field "$J" skip_reason)"
  eq "$C" "sync-status.json updated" "false" "$(json_field "$J" updated)"
  end_case "$C"
}

# Case 3 — main, clean, behind origin: fast-forward to origin/main.
case_main_behind_fast_forwards() {
  local C=main_behind_fast_forwards J tip
  begin_case
  make_repo "$C"; J="$WORK/sync-status.json"
  advance_origin "$C"
  tip="$(git -C "$ORIGIN" rev-parse refs/heads/main)"
  snapshot
  run_sync
  eq "$C" "exit code" 0 "$RC"
  eq "$C" "HEAD is origin/main's tip" "$tip" "$(head_after)"
  assert_that "$C" "the upstream change is in the working tree" \
    "$(grep -q 'the upstream moved on' "$WORK/agent/docs/README.md" || echo 'README.md does not have the upstream edit')"
  check_no_push "$C"
  check_no_commit "$C"
  eq "$C" "sync-status.json updated" "true" "$(json_field "$J" updated)"
  eq "$C" "sync-status.json skip_reason (it advanced)" "null" "$(json_field "$J" skip_reason)"
  end_case "$C"
}

# Case 4 — main behind origin with an uncommitted edit: still fast-forwards, and
# the edit is carried across by autostash rather than discarded.
case_main_behind_with_dirty_file() {
  local C=main_behind_with_dirty_file J tip
  begin_case
  make_repo "$C"; J="$WORK/sync-status.json"
  advance_origin "$C"
  printf '# a hand edit that must survive the update\n' >> "$WORK/agent/DEFECTS.md"
  tip="$(git -C "$ORIGIN" rev-parse refs/heads/main)"
  snapshot
  run_sync
  eq "$C" "exit code" 0 "$RC"
  eq "$C" "HEAD is origin/main's tip" "$tip" "$(head_after)"
  assert_that "$C" "the hand edit survived the fast-forward" \
    "$(grep -q 'must survive the update' "$WORK/agent/DEFECTS.md" || echo 'the edit is gone — the update discarded it')"
  assert_that "$C" "the hand edit is still uncommitted" \
    "$(git -C "$WORK" diff --quiet -- agent/DEFECTS.md && echo 'the file is clean — the run committed it')"
  check_no_push "$C"
  check_no_commit "$C"
  eq "$C" "sync-status.json updated" "true" "$(json_field "$J" updated)"
  end_case "$C"
}

# Case 5 — main with a local commit ahead of origin: no push, no rewritten history.
case_main_ahead_does_not_push() {
  local C=main_ahead_does_not_push J local_head
  begin_case
  make_repo "$C"; J="$WORK/sync-status.json"
  printf '# local only\n' > "$WORK/agent/docs/local-only.md"
  git -C "$WORK" add agent/docs/local-only.md
  git -C "$WORK" commit -q -m "docs(seed): a commit origin does not have"
  local_head="$(git -C "$WORK" rev-parse HEAD)"
  snapshot
  run_sync
  eq "$C" "exit code" 0 "$RC"
  eq "$C" "HEAD is still the local commit" "$local_head" "$(head_after)"
  assert_that "$C" "the local commit still exists (history was not rewritten)" \
    "$(git -C "$WORK" cat-file -e "$local_head" 2>/dev/null || echo 'the commit object is gone')"
  assert_that "$C" "origin still does not have it" \
    "$(git -C "$ORIGIN" merge-base --is-ancestor "$local_head" refs/heads/main 2>/dev/null && echo 'origin/main contains the local commit')"
  check_no_push "$C"
  check_no_commit "$C"
  eq "$C" "sync-status.json ahead" "1" "$(json_field "$J" ahead)"
  eq "$C" "sync-status.json skip_reason" "ahead-of-origin" "$(json_field "$J" skip_reason)"
  eq "$C" "sync-status.json updated" "false" "$(json_field "$J" updated)"
  end_case "$C"
}

# Case 6 — `status` reports and changes nothing. An inspector runnable anywhere, any
# time, without side effects is worth more than one that writes a file, so it prints
# and leaves sync-status.json alone: the default mode owns that file, because the
# JSON is the record of a run that had something to record. The keys assertion below
# therefore runs against the default run in the same repo.
case_status_mode_changes_nothing() {
  local C=status_mode_changes_nothing J before
  begin_case
  make_repo "$C"; J="$WORK/sync-status.json"
  printf '# a hand edit\n' >> "$WORK/agent/DEFECTS.md"
  snapshot
  # (a) no status file yet: `status` must not create one.
  run_sync status
  eq "$C" "exit code" 0 "$RC"
  assert_that "$C" "status printed a report" "$([ -n "$OUT" ] || echo 'it printed nothing')"
  assert_that "$C" "status changed no tracked file" \
    "$([ "$(tracked_state)" = "$PRE_TRACKED" ] || echo "$(oneline "$PRE_TRACKED") -> $(oneline "$(tracked_state)")")"
  assert_that "$C" "status wrote no sync-status.json" \
    "$([ -f "$J" ] && echo 'it created one — status mode is print-only')"
  # (b) after a default run has written it, `status` must leave it untouched.
  run_sync
  eq "$C" "exit code (default mode, the writer)" 0 "$RC"
  assert_keys "$C" "$J"
  eq "$C" "sync-status.json state" "ok" "$(json_field "$J" state)"
  eq "$C" "sync-status.json branch" "main" "$(json_field "$J" branch)"
  before="$(git hash-object "$J")"
  run_sync status
  eq "$C" "exit code (status after a run)" 0 "$RC"
  eq "$C" "status left sync-status.json byte-identical" "$before" "$(git hash-object "$J")"
  check_head_unchanged "$C"
  check_no_push "$C"
  check_no_commit "$C"
  end_case "$C"
}

# Case 7 — an uncommitted CODE path is reported by exit 3, and still not committed.
case_code_path_dirty_exits_3() {
  local C=code_path_dirty_exits_3 J
  begin_case
  make_repo "$C"; J="$WORK/sync-status.json"
  printf '# a hand edit to a skill — CODE, and this job will not commit it\n' >> "$WORK/agent/skills/demo/SKILL.md"
  snapshot
  run_sync
  eq "$C" "exit code (uncommitted CODE)" 3 "$RC"
  assert_that "$C" "the run names the dirty CODE path" \
    "$(printf '%s' "$OUT" | grep -q 'agent/skills/demo/SKILL.md' || echo 'the path is not named in the output')"
  assert_that "$C" "the CODE edit is still uncommitted" \
    "$(git -C "$WORK" diff --quiet -- agent/skills/demo/SKILL.md && echo 'the file is clean — the run committed it')"
  check_head_unchanged "$C"
  check_no_push "$C"
  check_no_commit "$C"
  eq "$C" "sync-status.json dirty_code" "1" "$(json_field "$J" dirty_code)"
  eq "$C" "sync-status.json state (exit 3 is a report, not a failure)" "ok" "$(json_field "$J" state)"
  eq "$C" "sync-status.json skip_reason" "current" "$(json_field "$J" skip_reason)"
  end_case "$C"
}

# Case 8 — a fetch that cannot run exits non-zero, leaves SYNC-STALLED at the repo
# root, and a later success takes the marker away again.
case_fetch_failure_is_loud() {
  local C=fetch_failure_is_loud J
  begin_case
  make_repo "$C"; J="$WORK/sync-status.json"
  printf '# a hand edit that a failed run must not touch\n' >> "$WORK/agent/DEFECTS.md"
  snapshot
  git -C "$WORK" remote set-url origin "$TMP/$C/absent.git"
  run_sync
  assert_that "$C" "exit code is non-zero (the fetch could not do its job)" \
    "$([ "$RC" -ne 0 ] || echo 'exit 0 — an unreachable origin was reported as success')"
  assert_that "$C" "SYNC-STALLED marks the failure at the repo root" \
    "$([ -f "$WORK/SYNC-STALLED" ] || echo 'no SYNC-STALLED marker at the repo root')"
  check_head_unchanged "$C"
  check_no_push "$C"
  check_no_commit "$C"
  assert_that "$C" "the hand edit is still uncommitted" \
    "$(git -C "$WORK" diff --quiet -- agent/DEFECTS.md && echo 'the file is clean — the run committed it')"
  eq "$C" "sync-status.json state" "failed" "$(json_field "$J" state)"
  assert_that "$C" "sync-status.json last_error names the failure" \
    "$( [ -n "$(json_field "$J" last_error)" ] && [ "$(json_field "$J" last_error)" != null ] || echo 'last_error is empty' )"
  git -C "$WORK" remote set-url origin "$ORIGIN"
  run_sync
  eq "$C" "exit code on the next run" 0 "$RC"
  assert_that "$C" "a later success removes SYNC-STALLED" \
    "$([ -f "$WORK/SYNC-STALLED" ] && echo 'the marker is still there')"
  eq "$C" "sync-status.json state after recovery" "ok" "$(json_field "$J" state)"
  assert_that "$C" "the failure stays on record (last_failure)" \
    "$( [ -n "$(json_field "$J" last_failure)" ] && [ "$(json_field "$J" last_failure)" != null ] || echo 'last_failure is empty' )"
  check_head_unchanged "$C"
  end_case "$C"
}

# Case 9 — a dirty file the incoming commit also changes.
# The property under test: `--autostash` can carry a dirty tree across a
# fast-forward, but it cannot re-apply an edit that the incoming commit has already
# changed. `git pull` exits 0 anyway, warns, and leaves the file unmerged with the
# edit in the stash — measured against the script this branch carried before the
# fix, which printed `update: fast-forwarded`, wrote `state: ok` and created no
# marker while `git status` showed `UU`. The edit has to survive in the stash and
# the run has to say so: this job never resolves, checks out or drops anything.
# Two runs, because the defect had two halves: the fast-forward that reports success
# while conflicting, and every run after it, which reads `current` because nothing
# moves HEAD again and reports `ok` over the same unmerged tree.
case_main_behind_dirty_file_the_pull_also_changes() {
  local C=main_behind_dirty_file_the_pull_also_changes J tip claims stash_before
  begin_case
  make_repo "$C"; J="$WORK/sync-status.json"
  advance_origin "$C" agent/DEFECTS.md
  printf '# a hand edit the incoming commit also touches\n' >> "$WORK/agent/DEFECTS.md"
  tip="$(git -C "$ORIGIN" rev-parse refs/heads/main)"
  snapshot
  run_sync
  assert_that "$C" "exit code is non-zero (the fast-forward could not re-apply the edit)" \
    "$([ "$RC" -ne 0 ] || echo 'exit 0 — a conflicted autostash was reported as a successful update')"
  eq "$C" "HEAD is origin/main's tip (the fast-forward did happen)" "$tip" "$(head_after)"
  assert_that "$C" "SYNC-STALLED marks the conflict at the repo root" \
    "$([ -f "$WORK/SYNC-STALLED" ] || echo 'no SYNC-STALLED marker at the repo root')"
  eq "$C" "sync-status.json state" "failed" "$(json_field "$J" state)"
  assert_that "$C" "the report names the conflicting path" \
    "$(printf '%s' "$OUT" | grep -q 'agent/DEFECTS.md' || echo 'the path is not named in the run output')"
  assert_that "$C" "the script's own report calls it a conflict" \
    "$(printf '%s' "$OUT" | grep -qE '^omp-git-sync:.*onflict' || echo 'no line the script wrote says conflict (git warns about the autostash itself)')"
  assert_that "$C" "the report names the stash entry that holds the edit" \
    "$(printf '%s' "$OUT" | grep -q 'stash@{0}' || echo 'the run output does not name a stash entry')"
  assert_that "$C" "the edit is in a stash (it did not vanish)" \
    "$([ -n "$(git -C "$WORK" stash list)" ] || echo 'git stash list is empty — the edit is not in a stash')"
  assert_that "$C" "the path is left unmerged" \
    "$(git -C "$WORK" status --porcelain | grep -q '^UU agent/DEFECTS.md' || echo 'git status does not show UU agent/DEFECTS.md')"
  claims="$(printf '%s' "$OUT" | grep -E 'state: ok|update: +fast-forwarded')"
  assert_that "$C" "the output claims neither success nor a fast-forward" "$(oneline "$claims")"
  check_no_push "$C"
  check_no_commit "$C"

  # Phase 2 — the run after it. The state this leaves has to keep failing loudly: the
  # next run finds the same unmerged paths *before* it would pull, so it cannot pull,
  # must not invent a fast-forward, and must not drop the stash to tidy itself up.
  # That second run is where the defect hid: nothing changes HEAD, so measuring only
  # `behind` made a conflicted tree read as `current`, and the job reported a
  # successful run for as long as the tree stayed that way.
  stash_before="$(git -C "$WORK" stash list)"
  snapshot
  run_sync
  assert_that "$C" "the next run fails too (waiting does not clear the conflict)" \
    "$([ "$RC" -ne 0 ] || echo 'exit 0 — a tree left unmerged was reported as a successful run')"
  check_head_unchanged "$C"
  assert_that "$C" "SYNC-STALLED is still there" \
    "$([ -f "$WORK/SYNC-STALLED" ] || echo 'the marker went away without the conflict being resolved')"
  eq "$C" "sync-status.json state is still failed" "failed" "$(json_field "$J" state)"
  eq "$C" "the stashed edit is still the same stash entry" "$stash_before" "$(git -C "$WORK" stash list)"
  claims="$(printf '%s' "$OUT" | grep -E 'state: ok|update: +fast-forwarded')"
  assert_that "$C" "the second run claims neither success nor a fast-forward" "$(oneline "$claims")"
  end_case "$C"
}

# --- run --------------------------------------------------------------------

case_no_commit_no_push
case_feature_branch_skips
case_main_behind_fast_forwards
case_main_behind_with_dirty_file
case_main_ahead_does_not_push
case_status_mode_changes_nothing
case_code_path_dirty_exits_3
case_fetch_failure_is_loud
case_main_behind_dirty_file_the_pull_also_changes

total=$((PASS + FAILED))
printf '\n%d/%d passed\n' "$PASS" "$total"
[ "$FAILED" -eq 0 ] || exit 1
exit 0
