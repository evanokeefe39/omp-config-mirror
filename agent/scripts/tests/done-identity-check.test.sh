#!/usr/bin/env sh
#
# done-identity-check.test.sh — the Done-identity gate's contract, asserted against
# throwaway repos carrying real git history.
#
#   sh agent/scripts/tests/done-identity-check.test.sh [path/to/done-identity-check.sh]
#
# Every case builds its own repo under one `mktemp -d`, makes real commits, and runs
# the gate with an explicit base. Nothing outside that temp directory is touched, and
# no case needs the network.
#
# WHAT IT ASSERTS: a status that MOVES to `Done` fails the gate when the card carries
# no `Harness-Identity:` line, and passes when it carries a valid one; a card already
# `Done` at the base is not flagged however the range touches it; a card leaving `Done`
# is not flagged; a malformed marker, a stamp whose harness/commit says `unknown`, the
# pre-change four-fact stamp and a five-fact stamp missing only its last fact all fail;
# a base that does not resolve is exit 2 rather than a silent pass; and a card whose
# NAME holds a non-ASCII byte — the real repo has one, an em dash — is read and judged
# like any other rather than coming back C-quoted and unreadable.
#
# WHAT IT DOES NOT: that `pb-land` writes the stamp (that is the skill and the CI
# step), or that the stamped value is true — `harness-identity.ts` owns the value, and
# its own VERIFY row covers resolving it.
#
# Prints `ok <case> — <what>` / `FAIL <case>: <why>` per assertion and a final
# `<passed>/<total> passed`; any FAIL exits 1.
set -u

FIXTURE_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_UNDER_TEST="${1:-$FIXTURE_DIR/../done-identity-check.sh}"
if [ ! -f "$SCRIPT_UNDER_TEST" ]; then
  printf 'done-identity-check.test: no script under test at %s\n' "$SCRIPT_UNDER_TEST" >&2
  exit 2
fi
SCRIPT_UNDER_TEST="$(cd "$(dirname "$SCRIPT_UNDER_TEST")" && pwd)/$(basename "$SCRIPT_UNDER_TEST")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAILED=0
CASE_FAILS=0
REPO=""
OUT=""
RC=0

printf 'done-identity-check.test.sh\nscript under test: %s\n  blob %s\n\n' \
  "$SCRIPT_UNDER_TEST" "$(git hash-object "$SCRIPT_UNDER_TEST" 2>/dev/null || echo '(not a git object)')"

ok() { PASS=$((PASS + 1)); printf 'ok   %s — %s\n' "$1" "$2"; }
bad() { FAILED=$((FAILED + 1)); CASE_FAILS=$((CASE_FAILS + 1)); printf 'FAIL %s: %s\n' "$1" "$2"; }
eq() { if [ "$3" = "$4" ]; then ok "$1" "$2"; else bad "$1" "$2 — expected [$3], got [$4]"; fi; }
contains() { case "$3" in *"$4"*) ok "$1" "$2";; *) bad "$1" "$2 — output has no [$4]: $3";; esac; }

begin_case() { CASE_FAILS=0; }
end_case() {
  [ "$CASE_FAILS" -gt 0 ] || return 0
  printf '     ── %s: gate output (exit %s) ──\n' "$1" "$RC"
  printf '%s\n' "$OUT" | sed 's/^/     | /'
}

MARKER='Harness-Identity: harness=omp-config-mirror@omp-home-v0.6.0+1 commit=abc123def456-dirty-1a2b3c4d omp=18.12.2 model=provider/model session=01a14ac0'

# --- fixture ----------------------------------------------------------------

# card <slug> <status> [line...] — a task file in the fixture repo.
card() {
  slug="$1"
  status="$2"
  shift 2
  {
    printf -- '---\nid: TST-%s\ntitle: card %s\nstatus: %s\n---\n\n## Final Summary\n\n' "$slug" "$slug" "$status"
    for line in "$@"; do printf '%s\n' "$line"; done
  } >"$REPO/backlog/tasks/$slug - card.md"
}

commit() {
  git -C "$REPO" add -A >/dev/null 2>&1
  if ! out=$(git -C "$REPO" commit -q -m "$1" 2>&1); then
    bad fixture "cannot commit [$1] in $REPO: $out"
    return 1
  fi
}

# new_repo <case> — one commit holding three cards: `a` In Progress (the card a case
# moves), `b` and `c` Done (the grandfather and the leaving-Done subjects).
new_repo() {
  REPO="$TMP/$1/repo"
  mkdir -p "$REPO/backlog/tasks"
  git -C "$REPO" init -q -b main
  git -C "$REPO" config user.email test@example.com
  git -C "$REPO" config user.name Test
  # No hooks: the machine's global `core.hooksPath` would run the identity shim in
  # every fixture commit, which is noise here and a dependency on how this machine
  # is configured. The gate under test reads commits, it does not make them.
  git -C "$REPO" config core.hooksPath "$REPO/.git/no-hooks"
  card a "In Progress"
  card b "Done"
  card c "Done"
  commit base
}

run() { OUT="$(cd "$REPO" && sh "$SCRIPT_UNDER_TEST" "$@" 2>&1)"; RC=$?; }

# --- cases ------------------------------------------------------------------

begin_case
new_repo no-transition
card a "In Progress" "still being built" && commit "still in progress"
run HEAD~1
eq no-transition "a range with no Done transition is green" 0 "$RC"
contains no-transition "and says so" "$OUT" "0 Done transition(s)"
end_case no-transition

begin_case
new_repo red
card a "Done" && commit "set a Done"
run HEAD~1
eq red "a Done transition with no identity fails" 1 "$RC"
contains red "and names the card" "$OUT" "FAIL backlog/tasks/a - card.md"
contains red "and says what is missing" "$OUT" "no 'Harness-Identity:' line"
end_case red

begin_case
new_repo green
card a "Done" "$MARKER" && commit "set a Done, stamped"
run HEAD~1
eq green "a stamped Done transition passes" 0 "$RC"
contains green "and counts it" "$OUT" "1 Done transition(s)"
end_case green

begin_case
new_repo new-card-done
mkdir -p "$REPO/backlog/tasks"
printf -- '---\nid: TST-d\ntitle: card d\nstatus: Done\n---\n\n%s\n' "$MARKER" >"$REPO/backlog/tasks/d - card.md"
commit "a new card created Done"
run HEAD~1
eq new-card-done "a card created straight into Done is checked too" 0 "$RC"
contains new-card-done "and counted" "$OUT" "1 Done transition(s)"
end_case new-card-done

begin_case
new_repo grandfathered
card b "Done" "a later note" && commit "touch a card already Done at the base"
run HEAD~1
eq grandfathered "a card already Done at the base is not flagged" 0 "$RC"
contains grandfathered "and is not even checked" "$OUT" "0 Done transition(s)"
end_case grandfathered

begin_case
new_repo leaving-done
card c "In Progress" && commit "a failed review moves it back"
run HEAD~1
eq leaving-done "a card leaving Done is not flagged" 0 "$RC"
contains leaving-done "and is not counted" "$OUT" "0 Done transition(s)"
end_case leaving-done

begin_case
new_repo malformed
card a "Done" "Harness-Identity: harness=x commit=y omp=z" && commit "set a Done, half a stamp"
run HEAD~1
eq malformed "a marker with the wrong facts fails" 1 "$RC"
contains malformed "and says which fact is wrong" "$OUT" "expected 5 space-separated facts, found 3"
end_case malformed

begin_case
new_repo unknown-facts
card a "Done" "Harness-Identity: harness=unknown commit=abc123def456 omp=18.12.2 model=m session=s" && commit "set a Done, degraded"
run HEAD~1
eq unknown-facts "a stamp whose harness is unknown fails" 1 "$RC"
contains unknown-facts "and says why" "$OUT" "names no harness"
end_case unknown-facts

begin_case
new_repo non-ascii-red
card "omp-9 — em dash" "In Progress" && commit "a card whose name is not ASCII, in progress"
card "omp-9 — em dash" "Done" && commit "set it Done, unstamped"
run HEAD~1
eq non-ascii-red "a card name holding a non-ASCII byte is read, not C-quoted" 1 "$RC"
contains non-ascii-red "and is named in the failure" "$OUT" "FAIL backlog/tasks/omp-9 — em dash - card.md"
contains non-ascii-red "not reported as unreadable" "$OUT" "no 'Harness-Identity:' line"
end_case non-ascii-red

begin_case
new_repo non-ascii-green
card "omp-9 — em dash" "In Progress" && commit "a card whose name is not ASCII, in progress"
card "omp-9 — em dash" "Done" "$MARKER" && commit "set it Done, stamped"
run HEAD~1
eq non-ascii-green "the same card with a valid stamp passes" 0 "$RC"
contains non-ascii-green "and is counted" "$OUT" "1 Done transition(s)"
end_case non-ascii-green

begin_case
new_repo non-ascii-grandfathered
card "omp-9 — em dash" "Done" && commit "a card whose name is not ASCII, already Done"
card "omp-9 — em dash" "Done" "a later note" && commit "touch it"
run HEAD~1
eq non-ascii-grandfathered "touching it does not make it a finding" 0 "$RC"
contains non-ascii-grandfathered "and it is skipped, not read" "$OUT" "0 Done transition(s)"
end_case non-ascii-grandfathered

begin_case
new_repo four-facts-prechange
card a "Done" "Harness-Identity: harness=omp-config-mirror@omp-home-v0.6.0+1 omp=18.12.2 model=m session=s" && commit "set a Done with the pre-change four-fact stamp"
run HEAD~1
eq four-facts-prechange "the pre-change extension's four-fact stamp fails" 1 "$RC"
contains four-facts-prechange "and says how many facts it found" "$OUT" "expected 5 space-separated facts, found 4"
end_case four-facts-prechange

begin_case
new_repo four-facts-truncated
card a "Done" "Harness-Identity: harness=x commit=y omp=z model=m" && commit "set a Done with a truncated five-fact stamp"
run HEAD~1
eq four-facts-truncated "a stamp missing only its last fact fails too" 1 "$RC"
contains four-facts-truncated "and says how many facts it found" "$OUT" "expected 5 space-separated facts, found 4"
end_case four-facts-truncated

begin_case
new_repo bad-base
run no-such-ref
eq bad-base "an unresolvable base is exit 2, not a silent pass" 2 "$RC"
contains bad-base "and says nothing was checked" "$OUT" "nothing was checked"
end_case bad-base

begin_case
new_repo no-base-arg
run
eq no-base-arg "a missing base argument is exit 2" 2 "$RC"
end_case no-base-arg

printf '\n%s/%s passed\n' "$PASS" "$((PASS + FAILED))"
[ "$FAILED" -eq 0 ] || exit 1
