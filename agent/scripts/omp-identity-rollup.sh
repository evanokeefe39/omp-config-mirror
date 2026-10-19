#!/bin/sh
#
# omp-identity-rollup — the unique agent identities behind this branch.
#
# A squash-merge rebuilds the commit message from the PR title and body, so the
# `Agent-Identity:` trailers that `agent/scripts/git-hooks/prepare-commit-msg`
# put on the branch's commits do NOT survive into main. Appending this output to
# the PR body is what carries them across.
#
#   agent/scripts/omp-identity-rollup.sh [base]     base defaults to main, then origin/main
#
# STDOUT is the contract: the unique trailer VALUES, one per line, nothing else —
# it is pasted verbatim into a PR body, so a decoration here becomes noise there.
# Prefix each line with "Agent-Identity: " when you append it, otherwise the
# lines are plain text in the squash commit rather than a git trailer block.
#
# A branch with no agent commits prints "no identity trailers found" on STDERR
# and exits 0: an absent trailer is a normal state, not a failure. A base ref
# that does not resolve IS a failure (exit 1) — the answer is unknown then, and
# an empty result must not be confused with "nothing was stamped".

set -u

base="${1:-}"

if [ -z "$base" ]; then
  for candidate in main origin/main; do
    if git rev-parse --verify --quiet "$candidate" >/dev/null 2>&1; then
      base="$candidate"
      break
    fi
  done
fi

if [ -z "$base" ] || ! git rev-parse --verify --quiet "$base" >/dev/null 2>&1; then
  echo "omp-identity-rollup: no base ref — looked for main and origin/main, and '${base:-}' does not resolve." >&2
  echo "omp-identity-rollup: pass the base explicitly, or fetch it: omp-identity-rollup.sh origin/main" >&2
  exit 1
fi

# `valueonly` prints one line per matching trailer and a blank line for a commit
# that has none, so blanks are dropped before de-duplicating.
identities=$(
  git log --format='%(trailers:key=Agent-Identity,valueonly)' "$base..HEAD" 2>/dev/null |
    sed 's/[[:space:]]*$//' |
    sed '/^$/d' |
    sort -u
)

if [ -z "$identities" ]; then
  echo "omp-identity-rollup: no identity trailers found on ${base}..HEAD" >&2
  exit 0
fi

printf '%s\n' "$identities"
