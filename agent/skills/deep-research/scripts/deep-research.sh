#!/usr/bin/env bash
#
# deep-research.sh — Perplexity Deep Research on the user's Pro subscription.
#
# WHY THIS EXISTS: omp's own `web/perplexity` provider drives only the consumer
# `perplexity_ask` endpoint, which has no research mode reachable by a session
# cookie (verified 2026-10-01: every `mode`/`source` variant returns COPILOT).
# Deep Research is a separate server flow. `pwm` implements it against the same
# session cookie omp already stores, so this is the bridge.
#
# INVOCATION: bash skill://perplexity-deep-research/scripts/deep-research.sh "<question>"
#
# AUTH: reads the session token from omp's auth store (agent.db), the same
# token `/login perplexity` writes. No API key, no second login.
#
# EXIT: 0 = report on stdout. Non-zero = loud failure on stderr, never a
#       silent empty result (a blank answer must never look like success).

set -euo pipefail

QUERY="${1:-}"
if [ -z "$QUERY" ]; then
  echo "usage: deep-research.sh \"<research question>\"" >&2
  exit 2
fi

# --- locate the pwm binary ---------------------------------------------------
# uv tool installs to ~/.local/bin, which may not be on PATH in this shell.
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) PATH="$HOME/.local/bin:$PATH" ;;
esac
if ! command -v pwm >/dev/null 2>&1; then
  for cand in "$HOME/.local/bin/pwm" "$HOME/.local/bin/pwm.exe"; do
    if [ -x "$cand" ]; then PATH="$(dirname "$cand"):$PATH"; break; fi
  done
fi
if ! command -v pwm >/dev/null 2>&1; then
  echo "ERROR: pwm not found. Install it with: uv tool install perplexity-web-mcp-cli" >&2
  exit 127
fi

# --- locate a WORKING python interpreter -------------------------------------
# On Windows, `python3`/`python` on PATH is often the Microsoft Store stub,
# which exits 49 and prints a "Python was not found" notice instead of reading
# the auth store. `py` (the launcher) and an absolute install path are reliable.
# Probe candidates and keep the first that actually runs sqlite3.
PY_BIN=""
for cand in py python python3 /c/Python313/python /c/Python312/python /c/Python311/python; do
  if command -v "$cand" >/dev/null 2>&1 \
     && "$cand" -c 'import sqlite3' >/dev/null 2>&1; then
    PY_BIN="$cand"; break
  fi
done
if [ -z "$PY_BIN" ]; then
  for cand in /c/Python*/python /c/Python*/python.exe /c/Program\ Files/Python*/python \
              "$HOME/.local/bin/python" /usr/bin/python3 /usr/bin/python; do
    if [ -x "$cand" ] && "$cand" -c 'import sqlite3' >/dev/null 2>&1; then
      PY_BIN="$cand"; break
    fi
  done
fi
if [ -z "$PY_BIN" ]; then
  echo "ERROR: no working Python (with sqlite3) found; cannot read the session token" >&2
  exit 3
fi

# --- resolve the omp auth store ---------------------------------------------
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.omp/agent}"
DB="$AGENT_DIR/agent.db"
if [ ! -f "$DB" ]; then
  echo "ERROR: omp auth store not found at $DB" >&2
  exit 3
fi

# Read the token without printing it. Exits non-zero if absent.
TOKEN="$("$PY_BIN" - "$DB" <<'PY'
import json, sqlite3, sys
db = sys.argv[1]
try:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    row = con.execute(
        "SELECT data FROM auth_credentials WHERE provider='perplexity' LIMIT 1"
    ).fetchone()
    con.close()
except Exception as e:
    print(f"ERROR: cannot read auth store: {e}", file=sys.stderr)
    sys.exit(3)
if not row:
    print("ERROR: no perplexity credential in agent.db; run /login perplexity", file=sys.stderr)
    sys.exit(4)
try:
    tok = json.loads(row[0]).get("access", "")
except Exception as e:
    print(f"ERROR: perplexity credential is not readable JSON: {e}", file=sys.stderr)
    sys.exit(4)
if not tok:
    print("ERROR: perplexity credential has no access token; re-run /login perplexity", file=sys.stderr)
    sys.exit(4)
sys.stdout.write(tok)
PY
)"

if [ -z "$TOKEN" ]; then
  echo "ERROR: empty session token; re-run /login perplexity" >&2
  exit 4
fi

# --- seed pwm's token store --------------------------------------------------
PWM_DIR="$HOME/.config/perplexity-web-mcp"
mkdir -p "$PWM_DIR"
umask 077
printf '%s' "$TOKEN" > "$PWM_DIR/token"
chmod 600 "$PWM_DIR/token" 2>/dev/null || true

# --- run the research --------------------------------------------------------
OUT="$(mktemp)"
ERR="$(mktemp)"
trap 'rm -f "$OUT" "$ERR"' EXIT

set +e
pwm research "$QUERY" --json >"$OUT" 2>"$ERR"
RC=$?
set -e

if [ "$RC" -ne 0 ]; then
  echo "ERROR: pwm research failed (exit $RC)" >&2
  if [ -s "$ERR" ]; then cat "$ERR" >&2; fi
  case "$(cat "$ERR" "$OUT")" in
    *403*|*401*|*"SESSION EXPIRED"*|*expired*)
      echo "HINT: the Perplexity session expired. Re-run /login perplexity, then retry." >&2 ;;
  esac
  exit 1
fi

# A zero-byte or non-JSON success is the dangerous case: it looks like a
# completed run with no content. Refuse it.
if [ ! -s "$OUT" ]; then
  echo "ERROR: pwm research returned no output (exit 0). Treating as failure." >&2
  exit 1
fi

if ! "$PY_BIN" -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if d.get("answer") else 1)' "$OUT" 2>/dev/null; then
  echo "ERROR: pwm research returned no answer (malformed or empty JSON)." >&2
  echo "---- raw output ----" >&2
  cat "$OUT" >&2
  exit 1
fi

# --- render ------------------------------------------------------------------
"$PY_BIN" - "$OUT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
print(d["answer"].strip())
cites = d.get("citations") or []
if cites:
    print("\n## Citations")
    for i, c in enumerate(cites, 1):
        url = c if isinstance(c, str) else c.get("url", "")
        print(f"{i}. {url}")
print(f"\n[model: {d.get('model', '?')} · {len(cites)} citations]", file=sys.stderr)
PY
