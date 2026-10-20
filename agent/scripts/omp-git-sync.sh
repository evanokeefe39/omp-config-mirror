#!/usr/bin/env bash
#
# omp-git-sync — keep ~/.omp CURRENT, and report. It never writes history.
#
#   omp-git-sync.sh            fetch, fast-forward main when that is safe, report
#   omp-git-sync.sh status     report only, change nothing
#
# WHAT THIS IS NOT: a committer. Until 2026-10-12 it staged an allow-list, wrote
# `chore(config): sync <date>` onto whatever branch HEAD happened to be, and
# pushed. That made the machine an author: an uncommitted edit to a skill, rule,
# hook or config became an unreviewed commit on `main`, or — worse — folded into
# whichever feature branch was checked out, where a squash merge would carry
# data-only content into code history. Code and config reach `main` through a
# reviewed PR (`skill://git-conventions` `## Releases`); a backup job must not be
# a second, unreviewed path to the same place. History showed the shape of it: of
# the 22 sync commits ever made, 9 carried the memory tree and the rest were
# single-file edits to rules, skills, scripts and config — exactly the edits that
# were supposed to be reviewed. So the write half is gone. What is left is what a
# machine should do unattended: fetch, fast-forward, and say what it found.
#
# SAFETY (why this cannot publish anything, or lose anything):
#   * it never runs `git add`, `git commit`, `git stash` or `git push` — the one exception being the read-only `git stash list`;
#   * it fast-forwards only on `main`, only with no local commit ahead, and only
#     through `pull --rebase --autostash` — with nothing ahead, a rebase is a
#     fast-forward, so it can neither rewrite nor merge;
#   * on any other branch it fetches, reports, and touches nothing: a WIP branch
#     is not this job's to advance;
#   * a dirty tree is passed over the fast-forward by autostash, never discarded.
#     When the incoming commit touches the same lines the edit cannot be re-applied:
#     the tree is left unmerged, the content stays in the stash, and the run fails
#     saying so — this job never resolves a conflict, checks anything out, or drops
#     a stash;
#
# WHAT IT CANNOT DO, stated because it used to be implied: it backs nothing up.
# A ledger row, doc or config edit that matters has to be committed by whoever
# wrote it — the machine will not do it later. `status` says how much of the tree
# is uncommitted so that is visible rather than remembered.
#
# WHAT IT REPORTS: a stuck scheduler is invisible otherwise. A backup once sat
# dead for six days and the only symptom was silence, so a run leaves evidence:
#   * sync-status.json records last_success / last_failure / last_error, the
#     branch, how far the tree is ahead/behind origin, how far behind main, and
#     the dirty counts;
#   * SYNC-STALLED is created on failure and removed on success, so it shows up in
#     any plain listing of ~/.omp;
#   * a failing run exits non-zero; a deliberate skip exits 0 and says why;
#   * exit 3 marks dirty CODE paths — edits that exist on this machine only.
#     Nothing is staged either way; the report is the point.
#   * exit 4 marks a red data-sync staleness sensor: the machine's daily data job
#     has not completed inside its window, ended red, or left no readable record.
#     That is a report about another job, not a failure of this one — its own
#     coverage check runs inside it, so a run that never starts reports nothing
#     anywhere (OMP-6). Dirty CODE wins when both hold: a run carries one report
#     code, and the local edit is the one only this machine knows about.
#
# WHAT COUNTS AS A FAILURE: that it could not do its job — no remote, fetch
# failed, fast-forward failed, or an index left unmerged. A conflict is the one
# dirty state that is not merely reported: `git stash` refuses to save an unmerged
# tree, so nothing can be fast-forwarded until a human resolves it, and a run that
# finds one fails rather than reporting `ok`. Not failures: a dirty tree, another
# branch checked out, or a local commit ahead — states to report, not errors.
#
# RESTORE (after a wipe, on a new machine) is a GATED procedure, not a copy:
#   1. git clone <remote> ~/.omp
#   2. Compare each file against what exists before overwriting anything — a clone
#      into a populated ~/.omp will clobber live config.
#   3. State what changes irreversibly, snapshot the current files, and get
#      explicit approval before writing.
#   4. Sessions, memories and the usage ledger are NOT here — restore them from
#      example-data (usage Parquet in git, raw transcripts and memory state in R2).
#   5. Anything uncommitted at wipe time is gone. This job never copied it out.
# Secrets were never in git (agent/.env is gitignored), so none return.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATUS="$REPO/sync-status.json"
MARKER="$REPO/SYNC-STALLED"
# Every time the daily fast-forward moves HEAD, the code a running session reads
# from disk has changed. That is a deploy, and it is recorded so "which harness was
# live at time T" is answerable without guessing from commit timestamps.
DEPLOYS="$REPO/SYNC-DEPLOYS.log"
# The previous names, migrated on the first run so the recorded age, the deploy
# history and the stall flag survive the rename. All three are ignored files this
# tool owns; the marker is the one that would otherwise linger forever, since a
# success removes only the name this script uses now.
if [ -f "$REPO/backup-status.json" ] && [ ! -f "$STATUS" ]; then
  mv -f "$REPO/backup-status.json" "$STATUS" 2>/dev/null || true
fi
if [ -f "$REPO/BACKUP-DEPLOYS.log" ] && [ ! -f "$DEPLOYS" ]; then
  mv -f "$REPO/BACKUP-DEPLOYS.log" "$DEPLOYS" 2>/dev/null || true
fi
if [ -f "$REPO/BACKUP-STALLED" ] && [ ! -f "$MARKER" ]; then
  mv -f "$REPO/BACKUP-STALLED" "$MARKER" 2>/dev/null || true
fi

# The two lists, kept for what they mean to a *report* — neither is staged:
#
#   CODE  — what the agent IS: rules, skills, hooks, config. An edit here exists
#           on this machine only until it is committed on a branch and reviewed.
#           This is the list whose dirtiness exits 3.
#   ALLOW — what the agent KNOWS and HAS DONE: ledgers, audits, docs, repo
#           settings. Uncommitted here is normal and usually harmless; the count is
#           reported so it does not accumulate unnoticed.
#
# Both lists are explicit so the counts mean something (a whole-tree count would
# be dominated by the DBs, sessions and blobs that live in this same tree). A path
# in neither list shows up as untracked in `git status`, which is the intended
# signal for a new artifact.
CODE=(
  agent/config.yml
  agent/APPEND_SYSTEM.md
  agent/AGENTS.md
  agent/WORKFLOWS.md
  agent/models.yml
  agent/mcp.json
  agent/agents
  agent/extensions
  agent/hooks
  agent/rules
  agent/commands
  agent/skills
  agent/scripts
# evals — the runner's harbor job configs, added 2026-10-20 with /eval (OMP-47).
# CODE, not ALLOW: a job names the task set, the environment and the harness config
# to measure, so an edit to one is content that is on this machine only until it is
# PR'd. In this repo the path is `~/.omp/evals/`.
  evals
# skills — root tree removed 2026-10-12 (SOLO-206); agent/skills is the only root
  plugins/package.json
)
ALLOW=(
  agent/DEFECTS.md
  agent/FEEDBACK.md
  agent/VERIFY.md
  agent/IMPROVEMENTS.md
  agent/last-changelog-version
  agent/audits
  agent/docs
  marketplaces.json
  .gitignore
  .gitattributes
# agent/reports/openrouter-uptime.jsonl — untracked 2026-10-12; custodied by R2 via example-data (SOLO-211)
)

# Scanned and reported, never used to block: nothing is published from here, so a
# credential-shaped string in a tracked file is something to know before it is
# committed by hand. `agent/scripts` is excluded because the pattern's own sources
# and documentation quote it.
SECRET_RE='AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

write_status() {
  local state="$1" error="${2:-}" branch="${3:-}" ahead="${4:-}" behind="${5:-}" \
        behind_main="${6:-}" updated="${7:-false}" skipped="${8:-}"
  # The previous stamps must be read BEFORE the file is overwritten, or both come
  # out empty on every run (observed).
  local prev_success prev_failure
  prev_success="$(last_stamp success)"
  prev_failure="$(last_stamp failure)"

  local now; now="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  local success failure
  if [ "$state" = "ok" ]; then success="$now"; failure="$prev_failure"; else success="$prev_success"; failure="$now"; fi

  printf '{\n  "state": "%s",\n  "last_run": "%s",\n  "last_success": %s,\n  "last_failure": %s,\n  "last_error": %s,\n  "branch": %s,\n  "ahead": %s,\n  "behind": %s,\n  "behind_main": %s,\n  "updated": %s,\n  "skip_reason": %s,\n  "dirty_code": %s,\n  "dirty_allow": %s,\n  "secrets_suspected": %s\n}\n' \
    "$state" \
    "$now" \
    "$(json_or_null "$success")" \
    "$(json_or_null "$failure")" \
    "$(if [ -n "$error" ]; then printf '"%s"' "$(printf '%s' "$error" | tr -d '"\\' | head -c 300)"; else printf 'null'; fi)" \
    "$(json_or_null "$branch")" \
    "${ahead:-null}" \
    "${behind:-null}" \
    "${behind_main:-null}" \
    "$updated" \
    "$(json_or_null "$skipped")" \
    "$(dirty_count "${CODE[@]}")" \
    "$(dirty_count "${ALLOW[@]}")" \
    "${SECRETS:-0}" > "$STATUS"
}

json_or_null() {
  if [ -n "$1" ]; then printf '"%s"' "$1"; else printf 'null'; fi
}

last_stamp() {
  local key="$1"
  [ -f "$STATUS" ] || return 0
  # Parse with Python, not a grep over a quoted pattern: write_status emits
  # `"last_success": null` when there is no prior success, so a
  # `"last_success": "..."` grep never matches that case, and a grep that matches
  # nothing under `set -euo pipefail` is a live abort risk. Failures here are
  # non-fatal by design: a status file we cannot read must not stop a run.
  "${PYTHON:-python}" - "$STATUS" "$key" <<'PY' 2>/dev/null || true
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        value = json.load(fh).get("last_" + sys.argv[2])
    if isinstance(value, str) and value:
        sys.stdout.write(value)
except Exception:
    pass
PY
}

# Commits on this branch that the remote does not have. With no upstream, every
# commit is local — reporting 0 there would call a repo whose only copy is on this
# machine "clean", which is the failure this tool exists to surface.
ahead_count() {
  if git -C "$REPO" rev-parse --verify -q "@{u}" >/dev/null 2>&1; then
    git -C "$REPO" rev-list --count "@{u}..HEAD"
  elif git -C "$REPO" rev-parse --verify -q HEAD >/dev/null 2>&1; then
    git -C "$REPO" rev-list --count HEAD
  else
    printf '0'
  fi
}

# Counted over an explicit list, not the whole tree: the two lists have to be
# told apart — CODE dirt exits 3, ALLOW dirt is only reported — and a whole-tree
# count cannot do that. The generated memory tree is not tracked here at all
# (`/agent/memories/` is ignored and example-data mirrors it to R2), so it no
# longer contributes to the count either way.
dirty_count() { git -C "$REPO" status --porcelain -- "$@" 2>/dev/null | wc -l | tr -d ' '; }

# Unmerged index entries, one path per line: the `UU`/`AA`/`DD`/`AU`/`UA`/`DU`/`UD`
# two-character codes `git status --porcelain` prints for a path with stages 1-3.
# Defined once because two call sites have to agree on what "conflicted" means, and
# because it decides what the run does next: `git stash` — and so `--autostash` —
# refuses to save a tree that has one, so no fast-forward is possible until a human
# resolves it. Never empty-by-accident: `|| true` keeps a clean tree from tripping
# `set -e` through the command substitution below.
unmerged_paths() {
  git -C "$REPO" status --porcelain 2>/dev/null \
    | grep -E '^(UU|AA|DD|AU|UA|DU|UD) ' | sed 's/^...//' || true
}

# `git rebase --abort` undoes a rebase in progress and nothing else: with no rebase
# to undo it exits non-zero and changes nothing — which is how a run came to report
# "the tree is unchanged" over a tree full of conflict markers. Ask before calling.
rebase_in_progress() {
  local gitdir
  gitdir="$(git rev-parse --absolute-git-dir 2>/dev/null || true)"
  [ -n "$gitdir" ] || return 1
  [ -d "$gitdir/rebase-merge" ] || [ -d "$gitdir/rebase-apply" ]
}

# Report an unmerged index, then fail with it. `why` says whether the conflict
# pre-dates this run or is what the fast-forward left behind; `stash` names the entry
# holding the edit in the second case. Nothing here resolves a conflict, checks
# anything out or drops a stash: the content stays where git put it, and this report
# is what makes it visible instead of leaving a green run over an unmerged tree.
fail_unmerged() {
  local why="$1" stash="${2:-}" paths
  paths="$(unmerged_paths | tr '\n' ' ' | sed 's/ $//')"
  {
    printf 'omp-git-sync: CONFLICT — %s\n' "$why"
    printf 'omp-git-sync:   unmerged path(s): %s\n' "$paths"
    printf 'omp-git-sync:   resolve them by hand; this job never resolves a conflict, checks anything out or drops a stash\n'
    [ -z "$stash" ] || printf 'omp-git-sync:   the edit is in %s — kept deliberately; inspect it with `git stash show -p %s`\n' "$stash" "${stash%%:*}"
  } >&2
  fail "$why (unmerged: $paths)"
}

fail() {
  printf 'omp-git-sync: ERROR — %s\n' "$1" >&2
  printf 'omp-git-sync: %s\n' "$(date '+%Y-%m-%d %H:%M')" > "$MARKER"
  write_status "failed" "$1"
  exit 1
}

trap 'fail "unexpected failure at line $LINENO"' ERR

# `-d "$REPO/.git"` is false inside a linked worktree, where `.git` is a FILE
# pointing at the real gitdir. Ask git, so the check is true wherever the repo is
# a repo — including the worktrees this harness develops in.
if ! git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1; then
  fail "no git repo at $REPO"
fi

# An edit to a CODE path is on this machine only until it is PR'd. This tool will
# not commit it, and a silent report would make the situation invisible: exits 3 so
# a scheduler's Last Result shows the abnormality without claiming the fetch
# failed (which would make `last_success` stale while it is fresh).
report_unreviewed_code() {
  local dirty
  dirty="$(git status --porcelain -- "${CODE[@]}" 2>/dev/null || true)"
  [ -z "$dirty" ] && return 0
  {
    echo "omp-git-sync: UNREVIEWED CODE — uncommitted, and this job will not commit it:"
    printf '%s\n' "$dirty"
    echo "  Commit it on a branch and open a PR (skill://git-conventions, section 'Releases'), or discard it."
  } >&2
  return 3
}

# The sibling job's staleness. The machine's daily data job runs on a different
# schedule, and its coverage check runs INSIDE it, so a run that never starts
# reports nothing anywhere — the failure OMP-6 exists for. This job already runs
# daily and already reports the harness's own staleness, so it evaluates the
# sibling's age through the same delivery path (a state file and a marker at the
# repo root) rather than inventing a second one. The sensor's own exit code is its
# verdict: 0 ok, 1 stale or red, 2 unknown. A missing sensor is reported and does
# not flip this job's verdict: the two ship together, so that is a broken checkout,
# and it must not read as green.
DATA_SYNC_RC=0
data_sync_report() {
  local mode="$1" script="$REPO/agent/scripts/data-sync-staleness.sh" rc=0
  if [ ! -f "$script" ]; then
    echo "data-sync: NOT CHECKED — $script is missing" >&2
    return 0
  fi
  # `|| rc=$?` so a red verdict does not trip this script's ERR trap: the sensor
  # reporting a problem is the sensor working, not this job failing.
  sh "$script" "$mode" || rc=$?
  DATA_SYNC_RC="$rc"
  return 0
}

print_report() {
  local branch="$1" ahead="$2" behind="$3" behind_main="$4" updated="$5" skipped="$6" \
        mode="${7:-status}"
  local successes; successes="$(last_stamp success)"
  echo "repo:     $REPO"
  echo "remote:   $(git remote get-url origin 2>/dev/null || echo '(none)')"
  echo "branch:   ${branch:-'(none)'}"
  echo "position: ${ahead} ahead / ${behind} behind origin, ${behind_main:-0} behind main"
  echo "dirty:    $(dirty_count "${CODE[@]}") CODE + $(dirty_count "${ALLOW[@]}") ALLOW path(s) uncommitted"
  echo "update:   $([ "$updated" = true ] && echo 'fast-forwarded' || echo "not applied${skipped:+ (${skipped})}")"
  if [ "${SECRETS:-0}" -gt 0 ]; then
    echo "SECRETS:  ${SECRETS} credential-shaped line(s) in the tracked diff — review before committing" >&2
  fi

  # The trailer machinery lives outside this repo, in `core.hooksPath`, so nothing
  # else here reveals when it goes missing: an `omp update` that regenerates that
  # directory, or a machine set up from scratch, stops stamping silently and the
  # only symptom is an empty rollup weeks later. One line, on the command an
  # operator already runs.
  if [ -x "$REPO/agent/scripts/install-git-hooks.sh" ]; then
    if sh "$REPO/agent/scripts/install-git-hooks.sh" --check >/dev/null 2>&1; then
      echo "identity: prepare-commit-msg current"
    else
      echo "identity: prepare-commit-msg MISSING or stale — run agent/scripts/install-git-hooks.sh" >&2
    fi
  fi
  echo "last:     ${successes:-never} (success) / $(last_stamp failure) (failure)"

  # A per-run exit code cannot catch a run that never happened — machine off, task
  # skipped on battery, or a disabled task. Flag it on age instead.
  if [ -n "$successes" ]; then
    local age_secs age_hours
    age_secs=$(( $(date +%s) - $(date -d "$successes" +%s 2>/dev/null || echo "$(date +%s)") ))
    age_hours=$(( age_secs / 3600 ))
    echo "age:      ${age_hours}h since the last successful run"
    if [ "$age_hours" -ge 48 ]; then
      echo "STALE:    no successful run in ${age_hours}h — investigate before trusting the tree" >&2
    fi
  else
    echo "STALE:    no successful run on record" >&2
  fi
  [ -f "$MARKER" ] && echo "STALLED:  $MARKER exists — the last run failed" || true

  # Last, so the harness's own state is read first and the sibling's follows it.
  data_sync_report "$mode"
}

# Credential-shaped strings in what is uncommitted right now, counted for the
# report. Only the diff against HEAD: a secret already committed is not something
# this job can speak to, and scanning the whole tree on every run is not worth it.
secret_hits() {
  git -C "$REPO" diff -U0 HEAD -- . ':(exclude)agent/scripts' 2>/dev/null \
    | grep -Ec "$SECRET_RE" 2>/dev/null || true
}

# --- status: report only, change nothing -----------------------------------
if [ "${1:-update}" = "status" ]; then
  BRANCH_NOW="$(git -C "$REPO" symbolic-ref --short -q HEAD || true)"
  AHEAD="$(ahead_count)"
  BEHIND="0"; BEHIND_MAIN="0"
  if git -C "$REPO" rev-parse --verify -q "@{u}" >/dev/null 2>&1; then
    BEHIND="$(git -C "$REPO" rev-list --count "HEAD..@{u}")"
  fi
  if git -C "$REPO" rev-parse --verify -q origin/main >/dev/null 2>&1; then
    BEHIND_MAIN="$(git -C "$REPO" rev-list --count "HEAD..origin/main")"
  fi
  SECRETS="$(secret_hits)"
  print_report "$BRANCH_NOW" "$AHEAD" "$BEHIND" "$BEHIND_MAIN" false "status"
  exit 0
fi

cd "$REPO"

# 1. fetch. Every number below is measured against the remote, and stale remote
#    refs would make the report a guess. This is the one step that needs the
#    network, so it is the one step whose failure is a failure.
HAS_REMOTE=false
if git remote get-url origin >/dev/null 2>&1; then
  HAS_REMOTE=true
  if ! git fetch --prune --quiet origin; then
    fail "fetch failed — the live tree was not checked against origin"
  fi
fi

BRANCH="$(git symbolic-ref --short -q HEAD || true)"
HAS_UPSTREAM=false
git rev-parse --verify -q "@{u}" >/dev/null 2>&1 && HAS_UPSTREAM=true
AHEAD=0; BEHIND=0; BEHIND_MAIN=0
if [ "$HAS_UPSTREAM" = true ]; then
  AHEAD="$(git rev-list --count "@{u}..HEAD")"
  BEHIND="$(git rev-list --count "HEAD..@{u}")"
fi
if git rev-parse --verify -q origin/main >/dev/null 2>&1; then
  BEHIND_MAIN="$(git rev-list --count "HEAD..origin/main")"
fi

SECRETS="$(secret_hits)"

# 2. decide. Fast-forward, or say precisely why not. A skip is a decision, not a
#    failure: a WIP branch and a local commit ahead are both states somebody chose.
#    An unmerged index is neither — it blocks the fast-forward outright, and only a
#    human can clear it — so on `main` it is the one dirty state that fails.
UPDATED=false
SKIP=""
UNMERGED="$(unmerged_paths)"
if [ "$HAS_REMOTE" = false ]; then
  SKIP="no-remote"
elif [ "$BRANCH" != "main" ]; then
  SKIP="branch-not-main"
elif [ "$HAS_UPSTREAM" != true ]; then
  SKIP="no-upstream"
elif [ -n "$UNMERGED" ]; then
  # Checked before the pull, so this conflict is not this run's doing: a run that
  # leaves one fails on the spot below. Nothing is pulled over it, and the tree is
  # left exactly as whoever has to resolve it left it.
  fail_unmerged "unresolved conflict(s) in the tree before this run — this job did not create them, and it will not pull over them"
elif [ "$AHEAD" != "0" ]; then
  SKIP="ahead-of-origin"
elif [ "$BEHIND" = "0" ]; then
  SKIP="current"
else
  # Nothing ahead, so `--rebase` has nothing to replay: this is a fast-forward, and
  # `--autostash` carries a dirty tree across it rather than discarding it. Two
  # things follow from the stash: a staged edit comes back unstaged (reported), and
  # an edit to a file the incoming commit also changes cannot be re-applied at all —
  # then HEAD has moved, the content is in the stash, and the tree is left unmerged.
  BEFORE="$(git rev-parse HEAD)"
  STAGED_BEFORE="$(git diff --cached --name-only | sort)"
  if ! git pull --rebase --autostash --quiet; then
    if rebase_in_progress; then
      git rebase --abort 2>/dev/null || true
      fail "fast-forward failed; the rebase was aborted and the tree is unchanged — it will retry next run"
    fi
    # No rebase to unwind, so nothing here can promise the tree is unchanged: say
    # that instead of the sentence a conflicted autostash used to get.
    fail "fast-forward failed with no rebase to abort — the tree may not be unchanged; inspect it by hand (nothing was committed, pushed or discarded)"
  fi
  STAGED_AFTER="$(git diff --cached --name-only | sort)"
  # Report only: re-staging would be this job writing to the tree, and the content
  # itself is untouched on disk. `awk`, not `grep -vxF -f`: the pattern file for an
  # empty after-set is one empty line, and an empty pattern matches every line, so
  # the grep form would report nothing in exactly the common case.
  if [ "$STAGED_BEFORE" != "$STAGED_AFTER" ]; then
    STAGED_DROPPED="$(awk 'NR == FNR { after[$0]; next } !($0 in after)' \
      <(printf '%s\n' "$STAGED_AFTER") <(printf '%s\n' "$STAGED_BEFORE") | tr '\n' ' ' | sed 's/ $//')"
    [ -z "$STAGED_DROPPED" ] || printf 'index:    the fast-forward unstaged %s — re-add it if that was deliberate\n' "$STAGED_DROPPED"
  fi
  AFTER="$(git rev-parse HEAD)"
  if [ "$AFTER" != "$BEFORE" ]; then
    printf 'deploy %s %s..%s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$BEFORE" "$AFTER" >> "$DEPLOYS"
  fi
  UPDATED=true
  UNMERGED_AFTER="$(unmerged_paths)"
  if [ -n "$UNMERGED_AFTER" ]; then
    # The pull exited 0 — git keeps the stash and warns rather than failing — so this
    # is the only place the conflict is visible. The edit is deliberately left in the
    # stash: dropping it, resolving the file or checking one out would destroy
    # content this job did not write.
    fail_unmerged "the fast-forward moved HEAD but the stashed edit could not be re-applied" "$(git stash list | sed -n '1p')"
  fi
fi

rm -f "$MARKER"
write_status "ok" "" "$BRANCH" "$AHEAD" "$BEHIND" "$BEHIND_MAIN" "$UPDATED" "$SKIP"
print_report "$BRANCH" "$AHEAD" "$BEHIND" "$BEHIND_MAIN" "$UPDATED" "$SKIP" "run"
report_unreviewed_code || exit $?
# A red sibling sensor is the machine's alarm for a job that cannot raise its own
# (OMP-6): exit 4, distinct from 3 (unreviewed code here) and from 1 (this job could
# not do its job — a fetch or fast-forward failure). The sensor's own code says which
# of stale (1), red (1) or unknown (2) it is, and the state file and marker carry it.
[ "$DATA_SYNC_RC" -eq 0 ] || exit 4
exit 0
