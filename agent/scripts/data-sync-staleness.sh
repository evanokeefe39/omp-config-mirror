#!/usr/bin/env sh
#
# data-sync-staleness — how long ago the daily data backup last completed, read
# from OUTSIDE that job.
#
#   data-sync-staleness.sh          evaluate, write the state file and the marker, report
#   data-sync-staleness.sh status   report only, write nothing
#
# WHY THIS EXISTS (OMP-6 / SOLO-198): this machine's daily data backup runs a
# `sync.sh` from a private sibling checkout, and that script's own coverage check
# (step 6) is what reports a stalled mirror — from INSIDE the job. A run that never
# starts therefore reports nothing anywhere: on 2026-10-12 the scheduled task was
# Enabled and Ready with a refusal in Last Result, and the only evidence was a stale
# usage/meta.json. This script is the reader outside that job.
#
# WHAT IT READS, and why this evidence:
#   * r2-mirror-status.json `ran_at` — written by the LAST step of sync.sh
#     (`coverage_check.py --status-out`), so it exists only for a run that reached
#     the end of the job. Its age is the age of the last COMPLETED run, which is
#     what a stalled scheduler stops advancing. `ok`/`red_count` say whether that
#     run's mirror check passed.
#   * usage/meta.json `extracted_at` — written by step 2, so it can be fresh while
#     the run died later. It is reported as corroboration and never certifies a
#     green on its own.
# A missing or unreadable status file is `unknown` (red), never `ok`: absence of
# evidence is not evidence of health, and that is exactly what a job that never
# started leaves behind.
#
# THRESHOLD — 36 h. The job runs daily at 09:45 and catches up when the machine is
# next available (`StartWhenAvailable`), so one cadence is 24 h; 36 h is that cadence
# plus half again, so a single skipped run (laptop off, task refused on battery)
# does not red while a job that has not completed in a day and a half does.
# Overridable with DATA_SYNC_STALE_AFTER_HOURS for a fixture.
#
# WHERE IT LOOKS — found by name, never by a literal path: the sibling repo is
# PRIVATE and `agent/scripts` is on the config mirror's allow-list, so naming it
# here would make the mirror gate refuse its own tree (measured 2026-10-19: 34
# hits, exit 1 — `agent/scripts/mirror-config.sh`). The record is therefore the one
# `$HOME/repos/*/r2-mirror-status.json` match, and DATA_SYNC_DIR pins a directory
# when the layout is not that (DATA_SYNC_REPOS_ROOT moves the root being searched,
# which is what a fixture uses). Discovery FAILS CLOSED: two or more matches is
# `unknown` (red), naming them and asking for DATA_SYNC_DIR, because another
# checkout's fresher record would otherwise shadow a stalled one and report a green.
# Both surfaces that run this — the `bash -lc` of the scheduled task and the
# harness's own shell — set HOME (probed 2026-10-19); a shell with HOME unset finds
# nothing, and the report names what it looked for rather than passing as green.
#
# WHAT IT WRITES (default mode; `status` writes nothing, like omp-git-sync.sh):
#   * data-sync-status.json at the ~/.omp root — state, ages, evidence path — beside
#     the harness's own sync-status.json;
#   * DATA-SYNC-STALE at the ~/.omp root on any red, removed on green — the same
#     delivery path SYNC-STALLED uses, so it shows up in any plain listing of
#     ~/.omp instead of needing this script to be run before it can be seen.
# Both are machine-local state, gitignored, and never staged by any sync.
#
# EXIT: 0 ok · 1 stale, or a run that ended red · 2 unknown (nothing readable).
# Nothing here fails open: a reader that cannot read says so, and a state file that
# cannot be written is an error rather than a silent green.
set -eu

MODE="${1:-run}"
case "$MODE" in
  run|status) ;;
  *) printf 'data-sync-staleness: ERROR — unknown mode "%s" (expected no argument, or "status")\n' "$MODE" >&2
     exit 2 ;;
esac

# The job, its cadence and the window's origin are stated in the header.
STALE_AFTER_HOURS="${DATA_SYNC_STALE_AFTER_HOURS:-36}"
# Empty means "find the completion record"; a fixture, or a layout that is not
# `$HOME/repos/<checkout>/`, pins the directory instead.
SYNC_DIR="${DATA_SYNC_DIR:-}"
REPOS_ROOT="${DATA_SYNC_REPOS_ROOT:-${HOME:-}/repos}"
# Derived from this file's own location, so a copy of the harness — a worktree, a
# test fixture — reports into that copy rather than into the live ~/.omp.
REPO="${DATA_SYNC_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
STATUS="$REPO/data-sync-status.json"
MARKER="$REPO/DATA-SYNC-STALE"
PYTHON="${PYTHON:-python}"

# The reader is Python, not a grep over the JSON: the two timestamps are ISO 8601
# with and without fractional seconds and always UTC, the arithmetic has to agree
# with the clock that wrote them, and the record itself has to be located. `|| true`
# keeps a broken interpreter from aborting the script: an empty FIELDS is reported
# as unknown below, which is red.
FIELDS="$("$PYTHON" - "$SYNC_DIR" "$REPOS_ROOT" "$STALE_AFTER_HOURS" <<'PY' 2>/dev/null || true
import datetime
import glob
import json
import os
import sys

# Windows Python translates "\n" to "\r\n" in text-mode stdout, which would leave a
# CR on every value below and turn `state=ok` into an unrecognised `ok\r` — the
# exact silent failure this script exists to avoid. Reconfigure, and the shell side
# strips a stray CR anyway.
sys.stdout.reconfigure(newline="\n")

pinned, repos_root, window = sys.argv[1], sys.argv[2], float(sys.argv[3])
now = datetime.datetime.now(datetime.timezone.utc)
out = {
    "state": "unknown",
    "age_hours": None,
    "last_completed_run": None,
    "mirror_ok": None,
    "red_count": None,
    "warn_count": None,
    "extract_age_hours": None,
    "evidence": "",
    "looked": "",
    "records_seen": 0,
    "detail": "",
}
notes = []


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def parse(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed


def hours_since(moment):
    return round((now - moment).total_seconds() / 3600.0, 1)


# Locate the completion record. Pinned wins. Unpinned, every candidate under the
# repos root is a candidate — and more than one is refused rather than guessed at:
# another checkout's fresher record would shadow a stalled one and report a green,
# which is the exact failure this script exists to prevent. Fail closed.
if pinned:
    candidates = [os.path.join(pinned, "r2-mirror-status.json")]
    out["looked"] = "the pinned directory %s" % pinned
    ambiguous = False
else:
    candidates = sorted(glob.glob(os.path.join(repos_root, "*", "r2-mirror-status.json")))
    out["looked"] = "%s/*/r2-mirror-status.json (%d match(es))" % (repos_root, len(candidates))
    ambiguous = len(candidates) > 1
out["records_seen"] = len(candidates)

best = None
if ambiguous:
    out["detail"] = (
        "%d completion records found and none pinned — refusing to guess which one this "
        "machine's daily data job writes, because another checkout's fresher record would "
        "report a green over a stalled one: %s. Set DATA_SYNC_DIR to the directory that "
        "holds the record the job writes." % (len(candidates), ", ".join(candidates))
    )
for path in candidates if not ambiguous else []:
    try:
        record = load(path)
    except FileNotFoundError:
        notes.append("%s does not exist" % path)
        continue
    except Exception as exc:
        notes.append("%s is not readable JSON (%s)" % (path, type(exc).__name__))
        continue
    ran_at = parse(record.get("ran_at"))
    if ran_at is None:
        notes.append("%s carries no parsable ran_at" % path)
        continue
    if not isinstance(record.get("ok"), bool):
        notes.append("%s carries no ok flag, so the run's outcome cannot be read" % path)
        continue
    if best is None or ran_at > best[0]:
        best = (ran_at, record, path)

# Corroboration only: step 2 writes this, so it can be fresh while the run died later.
if best is not None:
    base = os.path.dirname(best[2])
elif pinned:
    base = pinned
else:
    base = None
if base is None:
    notes.append("usage/meta.json not read (no completion record to sit beside)")
else:
    try:
        extracted = parse(load(os.path.join(base, "usage", "meta.json")).get("extracted_at"))
        if extracted is None:
            notes.append("usage/meta.json carries no parsable extracted_at")
        else:
            out["extract_age_hours"] = max(hours_since(extracted), 0.0)
    except Exception as exc:
        notes.append("usage/meta.json unreadable (%s)" % type(exc).__name__)

if best is None:
    if not ambiguous:
        out["detail"] = "no readable completion record — %s" % out["looked"]
else:
    ran_at, record, path = best
    out["evidence"] = path
    age = hours_since(ran_at)
    if age < 0:
        notes.append("ran_at is in the future — clock skew")
        age = 0.0
    out["age_hours"] = age
    out["last_completed_run"] = record.get("ran_at")
    out["mirror_ok"] = record.get("ok")
    out["red_count"] = record.get("red_count")
    out["warn_count"] = record.get("warn_count")
    if age > window:
        out["state"] = "stale"
        out["detail"] = "the last completed run is older than the window"
    elif not record.get("ok"):
        # The age alone would call this fine: it ran, recently, and failed.
        out["state"] = "failed"
        out["detail"] = "the last completed run ended with its mirror check red"
    else:
        out["state"] = "ok"
        out["detail"] = "the last completed run is inside the window and its mirror check was green"

if notes:
    out["detail"] = "; ".join([out["detail"]] + notes) if out["detail"] else "; ".join(notes)


def scalar(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


# Diagnostic prose, not data: quotes and backslashes are folded so the value is
# safe to embed in both the JSON state file and a one-line report.
detail = str(out["detail"]).replace("\\", "/").replace('"', "'").replace("\n", " ")
looked = str(out["looked"]).replace("\\", "/").replace('"', "'").replace("\n", " ")
for key in (
    "state",
    "age_hours",
    "last_completed_run",
    "mirror_ok",
    "red_count",
    "warn_count",
    "extract_age_hours",
    "evidence",
    "records_seen",
):
    print("%s=%s" % (key, scalar(out[key])))
print("looked=%s" % looked)
print("detail=%s" % detail)
PY
)"
# A CR that survives into a value is not cosmetic: `ok\r` is a state name no case
# matches, and a raw CR inside a JSON string makes the state file unparsable. The
# reader is asked for LF above; this is the belt for a reader that ignores that.
FIELDS="$(printf '%s' "$FIELDS" | tr -d '\r')"

state=""; age_hours=""; last_run=""; mirror_ok=""; red_count=""; warn_count=""
extract_age=""; evidence=""; records_seen=""; looked=""; detail=""
while IFS='=' read -r key value; do
  case "$key" in
    state) state="$value" ;;
    age_hours) age_hours="$value" ;;
    last_completed_run) last_run="$value" ;;
    mirror_ok) mirror_ok="$value" ;;
    red_count) red_count="$value" ;;
    warn_count) warn_count="$value" ;;
    extract_age_hours) extract_age="$value" ;;
    evidence) evidence="$value" ;;
    records_seen) records_seen="$value" ;;
    looked) looked="$value" ;;
    detail) detail="$value" ;;
  esac
done <<EOF
$FIELDS
EOF

# No fields at all means the reader never ran — python missing, or killed. That is
# unknown, not ok: the check could not be performed.
if [ -z "$state" ]; then
  state="unknown"
  age_hours="null"; last_run="null"; mirror_ok="null"; red_count="null"
  warn_count="null"; extract_age="null"; evidence=""; records_seen="0"
  looked="${SYNC_DIR:-$REPOS_ROOT}"
  detail="the JSON reader ($PYTHON) produced nothing — python may be missing from PATH"
fi
case "$state" in
  ok|stale|failed|unknown) ;;
  *) state="unknown"; detail="the reader returned an unrecognised state" ;;
esac

now="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# Quotes and backslashes are stripped rather than escaped: every string written here
# is a path or a diagnostic sentence, and a JSON file that cannot be parsed is worse
# than one whose prose lost a quote.
json_str() { printf '%s' "$1" | tr '\\' '/' | tr -d '"'; }

# The report. Red states write to stderr, as omp-git-sync.sh's own do, so a caller
# that only captures stdout cannot mistake a stall for a green.
case "$state" in
  ok)
    printf 'data-sync: ok — last completed run %sh ago (window %sh), mirror green\n' \
      "$age_hours" "$STALE_AFTER_HOURS"
    printf 'data-sync:   evidence: %s ran_at=%s\n' "$evidence" "$last_run"
    ;;
  stale)
    printf 'data-sync: STALE — no completed data sync in %sh (window %sh)\n' \
      "$age_hours" "$STALE_AFTER_HOURS" >&2
    printf 'data-sync:   evidence: %s ran_at=%s\n' "$evidence" "$last_run" >&2
    printf 'data-sync:   the daily data sync task runs at 09:45; a run that never starts writes nothing, so age is the only signal\n' >&2
    ;;
  failed)
    printf 'data-sync: RED — the last completed run was %sh ago and its mirror check was red (%s red(s))\n' \
      "$age_hours" "$red_count" >&2
    printf 'data-sync:   evidence: %s ran_at=%s ok=false\n' "$evidence" "$last_run" >&2
    printf 'data-sync:   the mirror detail is in r2-mirror-status.json and R2-MIRROR-STALLED; this reports the age, not the cause\n' >&2
    ;;
  unknown)
    printf 'data-sync: UNKNOWN — no readable completion record (window %sh)\n' "$STALE_AFTER_HOURS" >&2
    printf 'data-sync:   looked for: %s\n' "$looked" >&2
    printf 'data-sync:   %s\n' "$detail" >&2
    printf 'data-sync:   a missing status file is not evidence of a healthy sync, so this is red, never ok\n' >&2
    ;;
esac
if [ "$state" != "unknown" ] && [ "$extract_age" != "null" ]; then
  printf 'data-sync:   usage/meta.json extracted %sh ago (step 2; corroboration only)\n' "$extract_age" >&2
fi

if [ "$MODE" = "status" ]; then
  printf 'data-sync:   mode=status — no state file and no marker written\n' >&2
else
  if ! {
    printf '{\n  "state": "%s",\n  "checked_at": "%s",\n  "last_completed_run": %s,\n  "age_hours": %s,\n  "stale_after_hours": %s,\n  "mirror_ok": %s,\n  "red_count": %s,\n  "warn_count": %s,\n  "extract_age_hours": %s,\n  "records_seen": %s,\n  "evidence": "%s",\n  "detail": "%s"\n}\n' \
      "$state" "$now" \
      "$([ "$last_run" = "null" ] && printf 'null' || printf '"%s"' "$(json_str "$last_run")")" \
      "$age_hours" "$STALE_AFTER_HOURS" "$mirror_ok" "$red_count" "$warn_count" \
      "$extract_age" "$records_seen" "$(json_str "$evidence")" "$(json_str "$detail")" > "$STATUS"
  }; then
    printf 'data-sync-staleness: ERROR — could not write the state file %s\n' "$STATUS" >&2
    exit 2
  fi
  if [ "$state" = "ok" ]; then
    rm -f "$MARKER" 2>/dev/null || true
  else
    if ! {
      printf '%s\nstate=%s\n%s\nevidence: %s\n' \
        "$now" "$state" "$detail" "$evidence" > "$MARKER"
    }; then
      printf 'data-sync-staleness: ERROR — could not write the marker %s\n' "$MARKER" >&2
      exit 2
    fi
    printf 'data-sync:   marker: %s\n' "$MARKER" >&2
  fi
fi

case "$state" in
  ok) exit 0 ;;
  unknown) exit 2 ;;
  *) exit 1 ;;
esac
