#!/usr/bin/env sh
#
# pre-push-gate.test.sh — the hook cannot reach the repository it is gating.
#
#   sh agent/scripts/tests/pre-push-gate.test.sh [path/to/pre-push-gate.sh]
#
# WHY THIS EXISTS. Git exports `GIT_DIR` into a hook's environment when the push
# comes from a LINKED WORKTREE (measured 2026-10-20: the value is exactly
# `git rev-parse --git-dir` inside that worktree), and a `GIT_DIR` in the
# environment beats `git -C <dir>` — every nested git command then acts on the
# repository the hook belongs to instead of the directory it names. That is not
# theoretical: the guard suites build throwaway repos under a temp directory
# with `git -C`, and on the gate's first end-to-end run from a worktree push
# those repos were redirected onto the harness repo —
# fixture commits landed on real branches, a fixture's `git init --bare` set
# `core.bare=true` in the shared config, a fixture's identity was written into
# `[user]`, and the working tree was switched to a fixture branch.
#
# So this case is the gate's contract, asserted against real repos and a real
# linked worktree: whatever a check does with `git -C <somewhere else>`, it lands
# somewhere else. Each stub below performs exactly the pattern the real suites
# perform, and every assertion after the run reads the OUTER repo.
#
# CASES
#   1 clean        — from a linked worktree, with the hook's leaked GIT_DIR, the
#                    outer repo's config, refs and HEAD are untouched; and the
#                    hazard repo the stub aimed at DID get its own config, so the
#                    assertion is not passing vacuously.
#   2 fails-closed — a check script missing from the tree is a refusal, not a pass.
#   3 control      — a copy of the gate with the neutralisation removed DOES let
#                    the same fixture rewrite the outer repo. Without this the
#                    first case could be green for the wrong reason.
#
# Nothing outside the temp directory is touched, and no case needs the network.
# Prints `ok <case> — <what>` / `FAIL <case>: <why>` per assertion and a final
# `<passed>/<total> passed`; any FAIL exits 1.
set -u

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"
GATE="${1:-$TESTS_DIR/../pre-push-gate.sh}"
if [ ! -f "$GATE" ]; then
  printf 'pre-push-gate.test: no gate under test at %s\n' "$GATE" >&2
  exit 2
fi
GATE="$(cd "$(dirname "$GATE")" && pwd)/$(basename "$GATE")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Git reports absolute paths in its own spelling (C:/… on Git for Windows) while
# `mktemp` hands back the shell's (/tmp/…). Every fixture path that is compared
# against git's own output is therefore built from `pwd -W` where that exists, so
# no assertion can fail on the spelling of a directory rather than on its state.
TMP_WIN="$(cd "$TMP" && { pwd -W 2>/dev/null || pwd; })"

PASS=0
FAILED=0
CASE_FAILS=0
OUT=""
RC=0

printf 'pre-push-gate.test.sh\ngate under test: %s\n  blob %s\n\n' \
  "$GATE" "$(git hash-object "$GATE" 2>/dev/null || echo '(not a git object)')"

ok() { PASS=$((PASS + 1)); printf 'ok   %s — %s\n' "$1" "$2"; }
bad() { FAILED=$((FAILED + 1)); CASE_FAILS=$((CASE_FAILS + 1)); printf 'FAIL %s: %s\n' "$1" "$2"; }
eq() { if [ "$3" = "$4" ]; then ok "$1" "$2"; else bad "$1" "$2 — expected [$3], got [$4]"; fi; }
# `same` for values too long to print both sides of (a whole config file).
same() { if [ "$3" = "$4" ]; then ok "$1" "$2"; else bad "$1" "$2 — it changed"; fi; }
contains() { case "$3" in *"$4"*) ok "$1" "$2";; *) bad "$1" "$2 — output has no [$4]: $3";; esac; }
begin_case() { CASE_FAILS=0; }
end_case() {
  [ "$CASE_FAILS" -gt 0 ] || return 0
  printf '     ── %s: gate output (exit %s) ──\n' "$1" "$RC"
  printf '%s\n' "$OUT" | sed 's/^/     | /'
}

# --- fixture ----------------------------------------------------------------

# build_fixture <root> — a repo with one commit, a linked worktree of it, and a
# copy of the gate whose six checks are stubs. One stub (ledger-check.sh) does
# what the real suites do: it builds its OWN repo under a temp directory with
# `git -C` and configures it. `$HAZARD_DIR` is where it aims; the test exports it
# so it can read that repo afterwards.
build_fixture() {
  root="$1"
  mkdir -p "$root/outer/agent/scripts/tests" "$root/outer/agent/hooks/pre/__tests__"

  git -C "$root/outer" init -q -b main
  git -C "$root/outer" config user.email fixture@example.invalid
  git -C "$root/outer" config user.name Fixture
  echo base >"$root/outer/base.txt"
  git -C "$root/outer" add -A >/dev/null 2>&1
  # Per-invocation, so the fixture repo carries NO core.hooksPath of its own: the
  # assertion below reads that key, and the machine's global hooks must not run in
  # here either (a hook that fires on the fixture's own commit would test the
  # machine, not the gate).
  git -C "$root/outer" -c core.hooksPath="$root/no-hooks" commit -q -m "chore: fixture base"

  cp "$GATE" "$root/outer/agent/scripts/pre-push-gate.sh"

  # The hazard stub: aim at a repo of its own, exactly as the guard suites do.
  cat >"$root/outer/agent/scripts/ledger-check.sh" <<'STUB'
#!/bin/sh
mkdir -p "$HAZARD_DIR"
git -C "$HAZARD_DIR" init -q -b main
git -C "$HAZARD_DIR" config core.hooksPath "$HAZARD_DIR/.git/no-hooks"
git -C "$HAZARD_DIR" config user.email hazard@example.invalid
exit 0
STUB
  chmod +x "$root/outer/agent/scripts/ledger-check.sh"

  # The rest are inert: this case is about what a check can reach, not about what
  # the checks assert (their own gates and suites own that).
  for stub in rule-frontmatter-check.py skill-root-check.py; do
    printf 'import sys\nsys.exit(0)\n' >"$root/outer/agent/scripts/$stub"
  done
  for stub in mirror-config.sh tests/pre-push-gate.test.sh; do
    printf '#!/bin/sh\nexit 0\n' >"$root/outer/agent/scripts/$stub"
  done
  # The gate runs every suite under agent/hooks/pre/__tests__ with bun; one that
  # exits 0 keeps the run green so the exit code is assertable.
  printf 'console.log("probe suite ok");\n' >"$root/outer/agent/hooks/pre/__tests__/probe.test.ts"

  git -C "$root/outer" add -A >/dev/null 2>&1
  git -C "$root/outer" -c core.hooksPath="$root/no-hooks" commit -q -m "chore: fixture gate"
  git -C "$root/outer" worktree add -q "$root/wt" -b probebranch

  HAZARD_DIR="$TMP_WIN/$(basename "$root")-hazard"
}

# run_gate <gate-path> <worktree> — the hook's environment, reproduced exactly:
# the leaked GIT_DIR and the working directory git runs a hook in. The path must
# be absolute (`--absolute-git-dir`), because that is what git exports and because
# a relative one would be resolved against the child's own cwd.
run_gate() {
  OUT="$(cd "$2" && GIT_DIR="$(git -C "$2" rev-parse --absolute-git-dir)" sh "$1" 2>&1)"
  RC=$?
}

# --- 1. clean ---------------------------------------------------------------

begin_case
F1="$TMP/clean"
build_fixture "$F1"
OUTER="$F1/outer"
WT="$F1/wt"
HAZARD="$HAZARD_DIR"
export HAZARD_DIR
CONFIG_BEFORE="$(cat "$OUTER/.git/config")"
MAIN_BEFORE="$(git -C "$OUTER" rev-parse refs/heads/main)"
WT_HEAD_BEFORE="$(git -C "$WT" rev-parse HEAD)"

run_gate "$OUTER/agent/scripts/pre-push-gate.sh" "$WT"

# The config file, byte for byte: this is the assertion that the incident would
# have failed, and it covers every key a check might write, not a list of them.
same clean "the outer repo's config file is byte-for-byte what it was" "$CONFIG_BEFORE" "$(cat "$OUTER/.git/config")"
eq clean "the outer repo's refs/heads/main is where it was" "$MAIN_BEFORE" "$(git -C "$OUTER" rev-parse refs/heads/main)"
eq clean "the worktree still holds the commit it started on" "$WT_HEAD_BEFORE" "$(git -C "$WT" rev-parse HEAD)"
eq clean "the worktree is still on its own branch" "probebranch" "$(git -C "$WT" rev-parse --abbrev-ref HEAD)"
eq clean "the outer repo's working tree is clean" "" "$(git -C "$OUTER" status --porcelain)"
# Non-vacuity: the stub really ran, and its own repo really got the config — so
# the assertions above are about the leak, not about a stub that did nothing.
eq clean "the hazard repo the check aimed at exists" "$HAZARD" "$(git -C "$HAZARD" rev-parse --show-toplevel 2>/dev/null)"
eq clean "the hazard repo got its own core.hooksPath" "$HAZARD/.git/no-hooks" "$(git -C "$HAZARD" config --get core.hooksPath 2>/dev/null)"
eq clean "the hazard repo got its own identity" "hazard@example.invalid" "$(git -C "$HAZARD" config --get user.email 2>/dev/null)"
if command -v bun >/dev/null 2>&1 && command -v uv >/dev/null 2>&1 && command -v bash >/dev/null 2>&1; then
  eq clean "the gate passed every stubbed check" "0" "$RC"
else
  printf 'skip clean — bun/uv/bash are not all on PATH, so the gate exit code is not asserted\n'
fi
end_case clean

# --- 2. fails closed --------------------------------------------------------
#
# Removed from the WORKTREE, which is the tree the gate gates: the two share a
# repository but not a working directory.

begin_case
rm -f "$WT/agent/scripts/rule-frontmatter-check.py"
run_gate "$OUTER/agent/scripts/pre-push-gate.sh" "$WT"
eq fails-closed "a missing check script refuses the push" "1" "$RC"
contains fails-closed "and names the script it could not run" "$OUT" "rule-frontmatter-check.py"
end_case fails-closed

# --- 3. control: the same fixture against a gate with no neutralisation ------
#
# LAST, because it is the case that damages its own fixture. It is what makes
# case 1 evidence: the assertions there can fail, and this is them failing.

begin_case
F3="$TMP/control"
build_fixture "$F3"
HAZARD3="$HAZARD_DIR"
export HAZARD_DIR="$HAZARD3"
grep -v '^unset GIT_DIR' "$GATE" >"$F3/outer/agent/scripts/gate-without-neutralisation.sh"
run_gate "$F3/outer/agent/scripts/gate-without-neutralisation.sh" "$F3/wt"
eq control "without the neutralisation the check reaches the outer repo" \
  "$HAZARD3/.git/no-hooks" "$(git -C "$F3/outer" config --local --get core.hooksPath 2>/dev/null)"
eq control "and the outer repo's identity is overwritten too" \
  "hazard@example.invalid" "$(git -C "$F3/outer" config --local --get user.email 2>/dev/null)"
end_case control

printf '\n%s/%s passed\n' "$PASS" "$((PASS + FAILED))"
[ "$FAILED" -eq 0 ] || exit 1
