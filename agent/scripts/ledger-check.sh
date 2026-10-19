#!/usr/bin/env bash
# ledger-check.sh — the four ledgers: schema intact, and no history lost.
#
# Answers three questions, one exit code:
#   1. does every row of each ledger table carry the declared column count?
#   2. has a HISTORY ledger's row count gone DOWN since HEAD?
#   3. does every IMPROVEMENTS row carry a valid `status`, and a `reason` exactly
#      when that status is `rejected`?
#
# The two ledger kinds need different rules, and conflating them makes the check
# cry wolf (observed 2026-09-28: removing a stale VERIFY row tripped a row-loss
# finding that was not a defect):
#
#   history  — DEFECTS, IMPROVEMENTS. Append-only: one row per instance, the count
#              is the signal, and a lost row is data loss. A check that misses
#              this cannot fail on the bug it exists for: an append that REPLACES
#              the last row leaves every row correctly shaped.
#   register — FEEDBACK, VERIFY. Describes what exists NOW. A retired or re-homed
#              entry legitimately drops a row, so only the schema is enforced —
#              holding a register to append-only is how a stale row survives.
#
# The ledger table is the first table at or after the "## Ledger" / "## Catalogue"
# heading; its separator line fixes the column count, and the declared schema is
# asserted against it so a header cannot be edited to match a broken body.
#
# Usage: ledger-check.sh [agent-dir]   exit 0 clean · 1 findings · 2 cannot run
set -uo pipefail

AGENT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# ledger:declared-columns:kind — the schema is owned by imp-defect / imp-feedback / imp-change / imp-verify.
LEDGERS=(
  DEFECTS.md:8:history
  IMPROVEMENTS.md:9:history
  FEEDBACK.md:4:register
  VERIFY.md:9:register
)

# IMPROVEMENTS only, stdin: `status` (cell 6) is implemented | not actioned | rejected,
# and `reason` (cell 8) is filled iff status is rejected, `—` otherwise. Bad rows on stderr.
check_status() {
  awk -F'|' -v label="$1" '
    /^## / { insec = ($0 ~ /^## (Ledger|Catalogue)[[:space:]]*$/) ? 1 : 0; hdr = 0; sep = 0; next }
    !insec || !/^\|/ { next }
    !hdr { hdr = 1; next }
    !sep { sep = 1; next }
    {
      st = $7; rs = $9
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", st)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", rs)
      if (st != "implemented" && st != "not actioned" && st != "rejected") {
        printf "BAD-STATUS %s:%d: status \"%s\"\n", label, FNR, st > "/dev/stderr"; bad = 1
      } else if (st == "rejected" && (rs == "" || rs == "—")) {
        printf "NO-REASON %s:%d: rejected without a reason\n", label, FNR > "/dev/stderr"; bad = 1
      } else if (st != "rejected" && rs != "—") {
        printf "STRAY-REASON %s:%d: %s row carries reason \"%s\"\n", label, FNR, st, rs > "/dev/stderr"; bad = 1
      }
    }
    END { exit bad + 0 }
  '
}

# stdin -> "<cols>\t<rows>" on stdout; malformed rows reported on stderr.
read_ledger() {
  awk -F'|' -v label="$1" '
    /^## / { insec = ($0 ~ /^## (Ledger|Catalogue)[[:space:]]*$/) ? 1 : 0; hdr = 0; sep = 0; next }
    !insec || !/^\|/ { next }
    !hdr { hdr = 1; next }
    !sep { sep = 1; want = NF - 2; next }
    {
      rows++
      if (NF - 2 != want) {
        printf "MALFORMED %s:%d: %d cols, want %d\n", label, FNR, NF - 2, want > "/dev/stderr"
        bad = 1
      }
    }
    END { printf "%d\t%d\n", want, rows + 0; exit bad + 0 }
  '
}

repo=$(git -C "$AGENT_DIR" rev-parse --show-toplevel 2>/dev/null) || {
  echo "ledger-check: not a git repository: $AGENT_DIR" >&2
  exit 2
}
prefix=$(git -C "$AGENT_DIR" rev-parse --show-prefix 2>/dev/null)

findings=0
printf '%-15s %-8s %5s %5s %5s  %s\n' ledger kind cols rows atHEAD note
for entry in "${LEDGERS[@]}"; do
  base="${entry%%:*}"; rest="${entry#*:}"
  declared="${rest%%:*}"; kind="${rest##*:}"
  path="$AGENT_DIR/$base"

  if [ ! -f "$path" ]; then
    printf '%-15s %-8s %s\n' "$base" "$kind" "MISSING"
    findings=$((findings + 1))
    continue
  fi

  line=$(read_ledger "$base" < "$path")
  rc=$?
  cols="${line%%$'\t'*}"; rows="${line##*$'\t'}"
  [ "$rc" -ne 0 ] && findings=$((findings + 1))

  # declared schema vs the table's own separator
  if [ "$cols" != "$declared" ]; then
    printf 'ledger-check: %s declares %s columns, schema says %s\n' "$base" "$cols" "$declared" >&2
    findings=$((findings + 1))
  fi

  # IMPROVEMENTS only: the status vocabulary and the reason-iff-rejected rule
  if [ "$base" = IMPROVEMENTS.md ] && ! check_status "$base" < "$path"; then
    findings=$((findings + 1))
  fi

  # histories only: the row count must not decrease against HEAD
  prev="—"
  if [ "$kind" = history ] && git -C "$repo" cat-file -e "HEAD:${prefix}${base}" 2>/dev/null; then
    prev=$(git -C "$repo" show "HEAD:${prefix}${base}" | read_ledger "$base(HEAD)" | cut -f2)
    if [ "$rows" -lt "$prev" ]; then
      printf 'ledger-check: %s lost rows — %s at HEAD, %s now\n' "$base" "$prev" "$rows" >&2
      findings=$((findings + 1))
    fi
  fi

  note=$([ "$cols" = "$declared" ] && echo ok || echo SCHEMA-DRIFT)
  printf '%-15s %-8s %5s %5s %5s  %s\n' "$base" "$kind" "$cols" "$rows" "$prev" "$note"
done

[ "$findings" -eq 0 ] && echo "ledger-check: clean" || echo "ledger-check: $findings finding(s)"
exit "$([ "$findings" -eq 0 ] && echo 0 || echo 1)"
