#!/usr/bin/env bash
# handoff.sh — sync an in-flight workstream between the laptop and an
# ALREADY-DEPLOYED agent on the Hetzner box, through the shared git remote
# (GitHub). Context handoff, NOT process migration: a committed HANDOFF.md
# carries the summary; files move over git.
#
# Box workspace is ~/repos/<repo> (NOT ~/workspace). All box commands use
# `bash -lc` so PATH (herdr/omp) and ~/.omp/provider.env (API keys) resolve.
#
#   --push  (laptop -> box):  laptop commits + pushes; box pulls; a box herdr
#                             session starts an omp agent seeded with HANDOFF.md.
#   --pull  (box -> laptop):  box commits + pushes; laptop pulls.
# Gitignored data (data/, media/, ...) does NOT travel via git. Pass --data
# <relpath> (repeatable) to mirror it between laptop and box through Cloudflare
# R2 (scripts/data-sync.py via boto3), auth via a shared ~/.aws R2 profile.
#
# Env: BOX_HOST (required)   BOX_USER (default evan)   BOX_WORKSPACE (default repos)
#      R2_PROFILE (default r2-handoff)   R2_BUCKET (default agent-handoff) — for --data;
#      each machine keeps that profile in its own ~/.aws/credentials (+ ~/.aws/config).
set -euo pipefail

BOX_USER="${BOX_USER:-evan}"
BOX_WORKSPACE="${BOX_WORKSPACE:-repos}"
SESSION_NAME="${SESSION_NAME:-}"

usage() {
  echo "usage: $0 --push|--pull --repo <dir> [--branch <branch>] [--session <name>] [--data <relpath>...]" >&2
  exit 2
}

# --- parse args ---
DIR=""; MODE=""; BRANCH=""; SESSION=""; DATA_DIRS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --push) MODE=push ;;
    --pull) MODE=pull ;;
    --repo) DIR="$2"; shift ;;
    --branch) BRANCH="$2"; shift ;;
    --session) SESSION="$2"; shift ;;
    --data) DATA_DIRS+=("$2"); shift ;;
    *) usage ;;
  esac
  shift
done
[ -n "$MODE" ] && [ -n "$DIR" ] || usage
[ -n "${BOX_HOST:-}" ] || { echo "error: BOX_HOST is not set (the box's IP/hostname)" >&2; exit 2; }
[ -d "$DIR/.git" ] || { echo "error: not a git repo: $DIR" >&2; exit 2; }

NAME="$(basename "$(git -C "$DIR" remote get-url origin 2>/dev/null || echo "$DIR")" .git)"
REMOTE_URL="$(git -C "$DIR" remote get-url origin 2>/dev/null || echo "git@github.com:$NAME.git")"
TS="$(date -u +%FT%TZ)"

ssh_box() { ssh -o BatchMode=yes "${BOX_USER}@${BOX_HOST}" "$@"; }

# --- denylist + secret scan (hard gate before any commit) ---
DENYLIST_GLOB='*.tfstate*|.secrets/*|terraform.tfvars|*.tfplan|*.pem|*.key'
secret_scan() {
  local file="$1"
  grep -qiE 'sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY' "$file" && return 1 || return 0
}

review_staged() {
  echo "--- staged files review (git status --porcelain) ---"
  git -C "$DIR" status --porcelain
  echo "-----------------------------------------------"
  # Hard-fail on denylisted filenames staged for commit.
  local bad
  bad="$(git -C "$DIR" diff --cached --name-only 2>/dev/null || true) $(git -C "$DIR" status --porcelain | awk '{print $2}')"
  if echo "$bad" | grep -qE "$DENYLIST_GLOB"; then
    echo "error: staged/untracked file matches denylist; refusing handoff." >&2
    exit 2
  fi
  # Secret-scan HANDOFF.md specifically.
  # `if`, not a trailing `&& ! secret_scan … && { … }` list: under `set -e` a
  # function whose LAST statement is a short-circuited AND-OR list returns that
  # list's failure status, and the bare `review_staged` call then aborts the
  # whole run before any branch or commit is made (measured 2026-10-19).
  if [ -f "$DIR/HANDOFF.md" ] && ! secret_scan "$DIR/HANDOFF.md"; then
    echo "error: HANDOFF.md looks like it contains a secret; refusing handoff." >&2
    exit 2
  fi
  return 0
}

# --- box pre-flight gates (provider.env present, herdr active) ---
box_preflight() {
  ssh_box "bash -lc 'test -f \$HOME/.omp/provider.env || { echo \"box preflight: provider.env missing\" >&2; exit 3; }; systemctl --user is-active --quiet herdr || { echo \"box preflight: herdr not active\" >&2; exit 3; }'"
}
# --- Gitignored-data transfer over R2 (boto3 mirror via scripts/data-sync.py). ---
# Each --data <relpath> mirrors to a stable live prefix handoff/<repo>/<relpath>
# on BOTH ends, so gitignored data travels with the handoff even though git does
# not carry it. Auth is a shared ~/.aws R2 PROFILE (creds never in .env/provider.env):
# default r2-handoff -> bucket agent-handoff, overridable via R2_PROFILE / R2_BUCKET.
# Each machine (laptop, box) keeps its own ~/.aws with that profile. The box runs
# data-sync.py (scp'd over) using its own ~/.aws profile.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_SYNC="$SCRIPT_DIR/data-sync.py"
R2_PROFILE="${R2_PROFILE:-r2-handoff}"
R2_BUCKET="${R2_BUCKET:-agent-handoff}"
pick_python() { command -v python3 >/dev/null 2>&1 && echo python3 || echo python; }
data_prefix() { echo "handoff/$NAME/$1"; }

# Reject unsafe/unwanted data paths before any transfer.
data_relpath_valid() {
  local rel="$1"
  case "$rel" in
    /*|..*|*/..*) echo "error: --data must be a repo-relative path (got: $rel)" >&2; return 1 ;;
    .git|.git/*)  echo "error: --data cannot be .git" >&2; return 1 ;;
    .secrets|.secrets/*) echo "error: --data cannot be .secrets" >&2; return 1 ;;
  esac
  echo "$rel" | grep -qE "$DENYLIST_GLOB" && { echo "error: --data path matches denylist: $rel" >&2; return 1; }
  [ -d "$DIR/$rel" ] || { echo "error: --data must be a directory that exists: $DIR/$rel" >&2; return 1; }
  return 0
}

# Laptop-side pre-flight: the R2 profile present in ~/.aws + boto3 importable.
data_preflight_laptop() {
  grep -qF "[$R2_PROFILE]" "$HOME/.aws/credentials" 2>/dev/null || {
    echo "error: --data needs an R2 profile [$R2_PROFILE] in ~/.aws/credentials on the laptop" >&2; exit 2; }
  "$(pick_python)" -c "import boto3" 2>/dev/null || { echo "error: boto3 not importable for data transfer ($(pick_python))" >&2; exit 2; }
}

# Box-side pre-flight: the R2 profile present in the box's ~/.aws + boto3 importable.
data_preflight_box() {
  ssh_box "grep -qF \"[$R2_PROFILE]\" \"\$HOME/.aws/credentials\" 2>/dev/null || { echo \"box: R2 profile [$R2_PROFILE] missing in ~/.aws/credentials\" >&2; exit 3; }; python3 -c \"import boto3\" 2>/dev/null || { echo \"box: boto3 not installed\" >&2; exit 3; }"
}

# Put the current data-sync.py on the box so both ends run the identical helper.
data_sync_to_box() {
  ssh_box "mkdir -p ~/scripts"
  scp -q -o BatchMode=yes "$DATA_SYNC" "${BOX_USER}@${BOX_HOST}:~/scripts/data-sync.py" || { echo "error: could not copy data-sync.py to the box" >&2; exit 2; }
}

# push: laptop dir -> R2 prefix; then box downloads prefix -> box workspace.
data_push() {
  data_preflight_laptop; data_preflight_box; data_sync_to_box
  local rel
  for rel in "${DATA_DIRS[@]}"; do
    data_relpath_valid "$rel" || exit 2
    local prefix; prefix="$(data_prefix "$rel")"
    echo "--- data push: $DIR/$rel -> s3://${R2_BUCKET}/$prefix (then box pulls) ---"
    "$(pick_python)" "$DATA_SYNC" --profile "$R2_PROFILE" --bucket "$R2_BUCKET" push "$DIR/$rel" "$prefix"
    ssh_box "mkdir -p \"\$HOME/$BOX_WORKSPACE/$NAME/$rel\" && python3 \"\$HOME/scripts/data-sync.py\" --profile '$R2_PROFILE' --bucket '$R2_BUCKET' pull '$prefix' \"\$HOME/$BOX_WORKSPACE/$NAME/$rel\""
  done
}

# pull: box dir -> R2 prefix; then laptop downloads prefix -> laptop dir.
data_pull() {
  data_preflight_laptop; data_preflight_box; data_sync_to_box
  local rel
  for rel in "${DATA_DIRS[@]}"; do
    data_relpath_valid "$rel" || exit 2
    local prefix; prefix="$(data_prefix "$rel")"
    echo "--- data pull: box $rel -> s3://${R2_BUCKET}/$prefix (then laptop pulls) ---"
    ssh_box "python3 \"\$HOME/scripts/data-sync.py\" --profile '$R2_PROFILE' --bucket '$R2_BUCKET' push \"\$HOME/$BOX_WORKSPACE/$NAME/$rel\" '$prefix'"
    "$(pick_python)" "$DATA_SYNC" --profile "$R2_PROFILE" --bucket "$R2_BUCKET" pull "$prefix" "$DIR/$rel"
  done
}

# --- branch policy: current branch unless protected, else chore/handoff-<date>-<slug> ---
# The prefix must be one the command guard's branch-naming check accepts
# (skill://git-conventions Branching), so a script-created branch is the same
# shape as a typed one and the convention cannot be bypassed unseen (OMP-15).
resolve_branch() {
  local cur; cur="$(git -C "$DIR" branch --show-current)"
  if [ -n "$BRANCH" ]; then
    echo "$BRANCH"
  elif [ "$cur" = "main" ] || [ "$cur" = "master" ]; then
    echo "chore/handoff-$(date -u +%Y%m%d)-$(basename "$DIR" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
  else
    echo "$cur"
  fi
}

commit_push_source() {
  local branch="$1"
  git -C "$DIR" checkout -q "$branch" 2>/dev/null || git -C "$DIR" checkout -q -b "$branch" || {
    # branch may already exist but not be checked out; try fetch+checkout.
    git -C "$DIR" fetch -q origin 2>/dev/null || true
    git -C "$DIR" checkout -q "$branch"
  }
  git -C "$DIR" add -A
  if git -C "$DIR" diff --cached --quiet; then
    echo "no changes to commit on $branch"
  else
    git -C "$DIR" commit -q -m "chore(handoff): $(date -u +%Y-%m-%dT%H:%MZ) ($branch)" || true
  fi
  git -C "$DIR" push -q origin "$branch"
  local sha; sha="$(git -C "$DIR" rev-parse HEAD)"
  echo "$sha"
}

if [ "$MODE" = "push" ]; then
  # --- Laptop -> box ---
  [ -f "$DIR/HANDOFF.md" ] || { echo "error: no HANDOFF.md in $DIR — the agent must write its session summary first" >&2; exit 2; }
  review_staged
  box_preflight
  BRANCH="$(resolve_branch)"
  SHA="$(commit_push_source "$BRANCH")"
  # Record branch + SHA in HANDOFF.md if not already (receiver pins to it).
  ssh_box "bash -lc 'mkdir -p \$HOME/$BOX_WORKSPACE && if [ ! -d \$HOME/$BOX_WORKSPACE/$NAME/.git ]; then git clone -q $REMOTE_URL \$HOME/$BOX_WORKSPACE/$NAME; else git -C \$HOME/$BOX_WORKSPACE/$NAME fetch -q origin && git -C \$HOME/$BOX_WORKSPACE/$NAME checkout -q $BRANCH 2>/dev/null || git -C \$HOME/$BOX_WORKSPACE/$NAME checkout -q -b $BRANCH origin/$BRANCH; git -C \$HOME/$BOX_WORKSPACE/$NAME pull -q --ff-only origin $BRANCH; fi; git -C \$HOME/$BOX_WORKSPACE/$NAME checkout -q $SHA'"
  echo "pushed to git remote + pulled on box: ~/$BOX_WORKSPACE/$NAME @ $BRANCH ($SHA)."
  [ ${#DATA_DIRS[@]} -gt 0 ] && data_push

  # --- Spawn the box agent in a herdr session, seeded with the handover doc.
  # Verified herdr 0.8.2 sequence: workspace create --cwd <repo> (honors cwd,
  # returns root_pane) -> agent start --kind omp --pane <id> -- "<msg>". The
  # agent lands in the persistent default session, phone-reachable via Moshi.
  # Context handoff: a FRESH omp agent reads HANDOFF.md and continues — no
  # session file is copied to the server.
  AGENT_NAME="${AGENT_NAME:-handover}"
  if [ -n "$SESSION" ]; then
    echo "note: target session '$SESSION' — attach with 'herdr --session $SESSION' on the box if you want it isolated; default session is used otherwise."
  fi
  MSG="Read HANDOFF.md at the repo root and continue the workstream. We are handing over this task: it is described in HANDOFF.md (goal, current state, next steps). Clone is ready at \$HOME/$BOX_WORKSPACE/$NAME on branch $BRANCH @ $SHA. Verify the last completed step, then continue."
  ssh_box "bash -lc 'export PATH=\$HOME/.local/bin:\$PATH; WS=\$(herdr workspace create --label handover --cwd \$HOME/$BOX_WORKSPACE/$NAME 2>/dev/null | jq -r .result.root_pane.pane_id); if [ -z \"\$WS\" ] || [ \"\$WS\" = null ]; then echo \"error: failed to create herdr workspace for handoff\" >&2; exit 3; fi; herdr agent start $AGENT_NAME --kind omp --pane \$WS --timeout 60000 -- \"$MSG\"'"
  echo "box agent started: 'herdr agent get $AGENT_NAME' to verify; 'herdr agent read $AGENT_NAME --lines 40' to follow it."
  echo "It is phone-reachable via Moshi (it is in the default herdr session)."
  # `if`, not `[ … ] && echo …`: as the script's LAST line a false test would
  # make a successful push exit 1 (the AND-OR list's status is the script's).
  if [ -n "$SESSION" ]; then echo "(box session: $SESSION)"; fi
else
  # --- Box -> laptop ---
  [ -f "$DIR/HANDOFF.md" ] || { echo "error: no HANDOFF.md in local $DIR — the box agent must write+push it before handing back" >&2; exit 2; }
  box_preflight
  ssh_box "bash -lc 'cd \$HOME/$BOX_WORKSPACE/$NAME && git add -A && { git diff --cached --quiet || git commit -q -m \"chore(handoff): $(date -u +%Y-%m-%dT%H:%MZ)\"; } && git push -q origin \$(git branch --show-current)'"
  ( cd "$DIR" && git fetch -q origin && git pull -q --ff-only )
  [ ${#DATA_DIRS[@]} -gt 0 ] && data_pull
  echo "pulled the box's work into $DIR (includes HANDOFF.md)."
  echo "Next: open a local agent/herdr session and read HANDOFF.md."
fi
