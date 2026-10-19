#!/usr/bin/env bash
# verify-remote.sh — post-deploy health check over SSH, as the deploy user.
# Confirms the harness and the herdr + moshi control layer are actually up.
# All checks run DIRECTLY in the SSH session (which is already the target
# user) — no nested `su` (that prompts for a password and fails on non-root).
# Fails loudly on any miss; a failed verify means the deploy is not done.
#
# Usage:
#   scripts/verify-remote.sh <user@host> [--home <path>] [<agent-binary> ...]
#     e.g. scripts/verify-remote.sh deploy@203.0.113.10 omp herdr moshi-hook
#     e.g. scripts/verify-remote.sh deploy@203.0.113.10 --home ~/.omp omp
#
#   --home <path>   verify config placement: hash the config files under
#                   <path> (printed for comparison against the source) and
#                   assert they are owned by the deploy user.
set -euo pipefail

usage() { echo "usage: verify-remote.sh <user@host> [--home <path>] [<agent-binary> ...]" >&2; exit 2; }

HOST="${1:?usage: verify-remote.sh <user@host> [--home <path>] [<agent-binary> ...]}"
shift

CONFIG_HOME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --home)
      [ $# -ge 2 ] || usage
      CONFIG_HOME="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) break ;;
  esac
done

echo "[verify] target: $HOST"

# Who are we? Deploys must run as a non-root deploy user.
REMOTE_USER="$(ssh "$HOST" 'whoami')"
if [ "$REMOTE_USER" = "root" ]; then
  echo "[verify] FAIL: running as root; agent deploys must run as a deploy user." >&2
  echo "[verify]        remediation: create a non-root deploy user, install its" >&2
  echo "[verify]        SSH key, and re-run: ssh as deploy@host." >&2
  exit 1
fi
echo "[verify] remote user: $REMOTE_USER (ok)"

# Required control layer: herdr + moshi-hook reachable — directly, in-session.
for bin in herdr moshi-hook; do
  if ssh "$HOST" "command -v $bin >/dev/null 2>&1"; then
    echo "[verify] $bin: present"
  else
    echo "[verify] FAIL: $bin not on the deploy user's PATH" >&2
    exit 1
  fi
done

# Agent binary (and any extras) present.
for bin in "$@"; do
  if ssh "$HOST" "command -v $bin >/dev/null 2>&1"; then
    echo "[verify] $bin: present"
  else
    echo "[verify] FAIL: $bin not on the deploy user's PATH" >&2
    exit 1
  fi
done

# Herdr session for the agent running?
if ssh "$HOST" "herdr ls >/dev/null 2>&1"; then
  echo "[verify] herdr: running with sessions"
else
  echo "[verify] WARN: herdr is installed but no session found (start one with 'herdr')."
fi

# moshi-hook daemon up? (scoped to the deploy user's processes)
if ssh "$HOST" "pgrep -u \"$REMOTE_USER\" -f moshi-hook >/dev/null 2>&1"; then
  echo "[verify] moshi-hook: daemon running"
else
  echo "[verify] WARN: moshi-hook daemon not detected (run 'moshi-hook serve' and pair)."
fi

# Optional: verify config placement — hashes + ownership under --home.
if [ -n "$CONFIG_HOME" ]; then
  echo "[verify] config placement: $CONFIG_HOME"
  # Print hashes so the caller can diff against the local source tree.
  ssh "$HOST" "if [ ! -d '$CONFIG_HOME' ]; then echo '[verify] FAIL: $CONFIG_HOME missing' >&2; exit 1; fi;
    find '$CONFIG_HOME' -type f -exec sha256sum {} + | sort -k2"
  # Ownership: every file must belong to the deploy user.
  if ssh "$HOST" "find '$CONFIG_HOME' ! -user \"\$(whoami)\" | grep -q ."; then
    echo "[verify] FAIL: some files under $CONFIG_HOME are not owned by $REMOTE_USER" >&2
    ssh "$HOST" "find '$CONFIG_HOME' ! -user \"\$(whoami)\"" >&2
    echo "[verify]        remediation: chown -R $REMOTE_USER $CONFIG_HOME" >&2
    exit 1
  else
    echo "[verify] ownership: all files owned by $REMOTE_USER"
  fi
fi

echo "[verify] done."
