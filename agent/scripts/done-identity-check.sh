#!/bin/sh
#
# done-identity-check — a card that MOVES to `Done` must carry the harness identity.
#
# `pb-land` sets the tasks it closes to `Done`, stamped with the harness identity
# that did the work — a `Harness-Identity: <value>` line in the card's final
# summary, whose value is exactly the commit trailer's
# (`agent/scripts/harness-identity.ts`, `skill://backlog-conventions`). Nothing in
# the tool enforces that, so this gate does.
#
#   sh agent/scripts/done-identity-check.sh <base-ref>
#
# Only a TRANSITION is checked — a card whose status at the base was something
# other than `Done`, and is `Done` at HEAD. A card already `Done` at the base is
# skipped whether or not the range touches it, so the cards that were `Done`
# before this rule existed are not retroactively red.
#
# Exit 0 = every Done transition carries an identity (or there were none);
#      1 = at least one does not;  2 = cannot run (no base, unreadable, not a repo).
#
# The identity's shape is owned by `agent/scripts/harness-identity.ts`; this reads
# it, so a format change is made in one place.
set -u

base="${1:-}"
if [ -z "$base" ]; then
  echo "usage: done-identity-check.sh <base-ref>   e.g. origin/main, a sha, HEAD^" >&2
  exit 2
fi
if ! git rev-parse --verify --quiet "${base}^{commit}" >/dev/null 2>&1; then
  echo "done-identity-check: base '${base}' does not resolve to a commit — nothing was checked" >&2
  exit 2
fi

# Task files differing between the base and HEAD, deletions aside: a deleted card
# cannot transition to anything. `core.quotePath=false` is load-bearing: with git's
# default, any path holding a byte above 0x7F comes back C-quoted (`"…\342\200\224…"`),
# and `git show "HEAD:$f"` then fails on a name that is perfectly valid — the em dash
# in a real card title was enough (measured 2026-10-19).
changed=$(git -c core.quotePath=false diff --name-only --diff-filter=d "$base" HEAD -- backlog/tasks) || {
  echo "done-identity-check: git diff failed against '${base}'" >&2
  exit 2
}

# `status:` from the YAML frontmatter only — the body has headings that could
# carry the word. CRLF is tolerated, since a task file may be written either way.
status_of() {
  awk 'NR == 1 && $0 != "---" { exit } NR == 1 { next } /^---[[:space:]]*$/ { exit } { print }' |
    sed -n 's/^status:[[:space:]]*//p' |
    head -n 1 |
    tr -d '\r' |
    sed 's/[[:space:]]*$//'
}

# The marker line's verdict on stdout: `ok`, or why it is not one. Always exits 0,
# so an empty verdict means awk never ran and the caller fails closed.
marker_verdict() {
  awk '
    {
      line = $0
      sub(/\r$/, "", line)
      sub(/^Harness-Identity:[ ]*/, "", line)
      n = split(line, tok, " ")
      if (n != 5) { print "expected 5 space-separated facts, found " n; exit 0 }
      want[1] = "harness"; want[2] = "commit"; want[3] = "omp"; want[4] = "model"; want[5] = "session"
      for (i = 1; i <= 5; i++) {
        if (split(tok[i], kv, "=") != 2 || kv[1] != want[i]) {
          printf "fact %d is \"%s\", expected \"%s=<value>\"\n", i, tok[i], want[i]; exit 0
        }
      }
      if (tok[1] == "harness=unknown" || tok[2] == "commit=unknown") {
        print "harness or commit is unknown, so the stamp names no harness"; exit 0
      }
      print "ok"
    }
  '
}

findings=0
checked=0
old_ifs=$IFS
IFS='
'
for f in $changed; do
  # The base is read FIRST. A card `Done` at the base is skipped before anything at
  # HEAD is read, so grandfathering holds even for a card whose content cannot be
  # read at all — reading HEAD first is what turned a merely touched card into a
  # finding.
  base_status=$(git show "$base:$f" 2>/dev/null | status_of)
  [ "$base_status" = "Done" ] && continue

  head_content=$(git show "HEAD:$f" 2>/dev/null) || {
    echo "done-identity-check: cannot read HEAD:$f — it counts as a finding, since a card that cannot be read cannot be checked" >&2
    findings=$((findings + 1))
    checked=$((checked + 1))
    continue
  }
  head_status=$(printf '%s\n' "$head_content" | status_of)
  [ "$head_status" = "Done" ] || continue

  checked=$((checked + 1))
  marker=$(printf '%s\n' "$head_content" | grep -m 1 '^Harness-Identity: ')
  if [ -z "$marker" ]; then
    echo "FAIL $f — status moved to Done with no 'Harness-Identity:' line" >&2
    findings=$((findings + 1))
    continue
  fi
  verdict=$(printf '%s\n' "$marker" | marker_verdict)
  if [ "$verdict" != "ok" ]; then
    echo "FAIL $f — 'Harness-Identity:' is not a valid identity: $verdict" >&2
    findings=$((findings + 1))
  fi
done
IFS=$old_ifs

if [ "$findings" -eq 0 ]; then
  echo "done-identity-check: ${checked} Done transition(s) in ${base}..HEAD carry the harness identity"
  exit 0
fi

echo "done-identity-check: ${findings} of ${checked} Done transition(s) in ${base}..HEAD carry no valid identity" >&2
echo "  stamp it: backlog task edit <ID> -s Done --append-final-summary \"Harness-Identity: \$(bun agent/scripts/harness-identity.ts)\"" >&2
exit 1
