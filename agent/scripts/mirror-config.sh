#!/usr/bin/env bash
# mirror-config — publish the harness's mechanism to the mirror repo.
#
# The harness repo (~/.omp) is PRIVATE, so an `Agent-Identity` trailer that names
# `omp-home-v0.5.0` resolves for nobody but the owner. This publishes the part of
# the config that is a *mechanism* — the instructions and code an agent runs —
# to `evanokeefe39/omp-config-mirror` under the same tag, so a commit's identity
# names the release its tree came from. That URL resolves for anyone only once
# the mirror is public: it is PRIVATE today, pending re-publicisation (OMP-26).
#
# Allow-list, never a copy of the tree: the working tree holds ~1.7 GB of
# sessions, blobs, databases and memories, and `agent/.env` holds credentials.
# `git ls-files` cannot emit them (they are untracked or ignored), and the paths
# below are the only ones read, so nothing outside the list can reach the mirror.
#
# Deliberately EXCLUDED, though tracked (audit 2026-10-19): the four ledgers,
# `audits/`, `docs/retrospectives/`, `agents/*/IMPROVEMENTS.md`,
# `agents/*/RETIRED.md` and `agents/*/CAPABILITIES.md`. They name private
# projects and a resume/job-search workstream. The mirror is the mechanism, not
# the history. `agent/scripts` IS on the allow-list, so this file must itself be
# free of private names — an earlier header that listed them made the gate refuse
# its own tree.
#
# Usage:  bash agent/scripts/mirror-config.sh <tag> [--dry-run]
#   <tag>       the tag to publish, e.g. omp-home-v0.5.0 (the repo must hold it)
#   --dry-run   write nothing; print what would be published
#
# Env:    MIRROR_REMOTE  target remote (default: the origin URL of the mirror
#                        clone, or git@github.com:evanokeefe39/omp-config-mirror.git)
#         MIRROR_DIR     mirror clone path (default: ~/.omp-mirror)
#
# Pre:    the harness repo is the cwd; the tag exists; the mirror remote is
#         reachable (SSH key for `git@github.com:…`, or a token for https).
# Post:   the mirror's `main` carries the tag's allow-listed tree, one commit
#         per tag ("omp-home <tag>"), tagged `<tag>`, and pushed. Re-running the
#         same tag is a no-op. Exits non-zero on any failure — a mirror that
#         silently published half a tree would be worse than none.
set -euo pipefail

tag="${1:-}"
dry="${2:-}"
if [ -z "$tag" ]; then
  echo "usage: bash agent/scripts/mirror-config.sh <tag> [--dry-run]" >&2
  exit 2
fi

here="$(cd "$(dirname "$0")/../.." && pwd)"
mirror_dir="${MIRROR_DIR:-$HOME/.omp-mirror}"
mirror_remote="${MIRROR_REMOTE:-git@github.com:evanokeefe39/omp-config-mirror.git}"

# ─── the allow-list ────────────────────────────────────────────────────────
# Paths, relative to the repo root. Directories are recursed by `git ls-files`.
paths=(
  agent/skills
  agent/rules
  agent/hooks
  agent/commands
  agent/extensions
  agent/scripts
  agent/agents/app-backend-designer.md
  agent/agents/app-backend-engineer.md
  agent/agents/app-backend-reviewer.md
  agent/agents/data-designer.md
  agent/agents/data-engineer.md
  agent/agents/data-reviewer.md
  agent/agents/dlc-reviewer.md
  agent/agents/doc-reviewer.md
  agent/agents/doc-writer.md
  agent/agents/harness-engineer.md
  agent/agents/harness-reviewer.md
  agent/agents/iac-engineer.md
  agent/agents/iac-reviewer.md
  agent/agents/ux-designer.md
  agent/agents/ux-engineer.md
  agent/agents/ux-reviewer.md
  agent/AGENTS.md
  agent/APPEND_SYSTEM.md
  agent/WORKFLOWS.md
  agent/config.yml
  agent/models.yml
  agent/mcp.json
  agent/docs/playbooks.md
  agent/docs/harness-engineering.md
  agent/docs/workflow-agent-contract.md
  version.txt
  release-please-config.json
  .release-please-manifest.json
  plugins/package.json
)

# ─── the deny-list ─────────────────────────────────────────────────────────
# Private repo names that must never reach the mirror. The allow-list says which
# FILES publish; this says what must not appear in their TEXT or their PATHS.
# Both are needed: the first publish (2026-10-19) shipped `agent/AGENTS.md`,
# `models.yml`, `WORKFLOWS.md`, `docs/` and a guard test naming private repos,
# because the allow-list is per-file and the leak is per-line.
#
# The names live in `private-names.txt`, which is NOT on the allow-list — an
# earlier revision kept them in this script, which put the script on the
# allow-list and made the gate refuse its own tree (review 2026-10-19).
deny_file="$here/agent/scripts/private-names.txt"
[ -f "$deny_file" ] || { echo "mirror-config: no deny list at $deny_file" >&2; exit 1; }
# Two entry kinds (see the file's header). A plain name matches with `-`, `_` and
# a space interchangeable; a `ctx:` name only matches in a repo-shaped context,
# so the ordinary words `crm`, `spectro` and `monet` do not fire on a CRM product
# category or the word "spectrograph".
#
# ERE escaping happens FIRST, then the separator fold. Escaping after folding
# breaks the fold's own `[-_ ]` class (`[` becomes `\[`), which the self-probe
# below caught on 2026-10-19 — the gate refused to run rather than passing as
# decorative. The class `[].[^$\\*\/]` starts with `]` so `]` is literal.
esc() { sed 's/[].[^$\\*\/]/\\&/g'; }
fold() { sed 's/[-_ ]/[-_ ]/g'; }
plain="$(grep -vE '^[[:space:]]*(#|$)' "$deny_file" | grep -v '^ctx:' | esc | fold | paste -sd'|' -)"
ctx="$(grep '^ctx:' "$deny_file" | sed 's/^ctx://' | esc | fold | paste -sd'|' -)"
# The GitHub owner every name in the list belongs to, declared in the list's own
# header (`# owner: <login>` — the login its regeneration command runs against).
# It bounds the `owner/name` context: `dashboard/frontend` and `api/v1/chat` are
# ordinary paths whose last segment happens to be a ctx name, and another owner's
# `spectro` is not this list's concern. A missing declaration refuses to run
# rather than quietly dropping a context the list's header promises.
owner="$(sed -n 's/^#[[:space:]]*owner:[[:space:]]*\([A-Za-z0-9][A-Za-z0-9._-]*\)[[:space:]]*$/\1/p' "$deny_file" | head -1)"
[ -n "$owner" ] || { echo "mirror-config: $deny_file declares no '# owner: <login>' line; the owner/name context cannot be built" >&2; exit 1; }
owner_re="$(printf '%s' "$owner" | esc)"
# A name character is [A-Za-z0-9._-]; `head` is what may precede a context and
# `tail` what may follow the name. Both are enforced, so one entry cannot fire
# inside a longer, unrelated name (`xomp-data`, `omp-data-science`).
bnd='[^A-Za-z0-9._-]'
head="(^|$bnd)"
tail="(\.git($bnd|\$)|$bnd|\$)"
deny="(^|$bnd)($plain)($bnd|\$)"
if [ -n "$ctx" ]; then
  # Repo-shaped context ONLY — a form a repo actually appears in, all five the
  # list's header names:
  #   github.com/<owner>/name, git@github.com:<owner>/name   an https or SSH URL
  #   repos/name, repos\name                                 a local checkout
  #   ~/name, ~\name                                         a home checkout
  #   <owner>/name                                           the declared owner
  #   name.git                                               a clone URL (below)
  # An earlier revision accepted `word/word`, which matched `marketing/frontend`,
  # `api/v1/chat` and CSV prose (`UChatMessages`) (measured 2026-10-19), and it
  # promised three forms it did not implement, so all three passed. This file is
  # itself published, so the examples stay placeholders: a real ctx name written
  # in one of these forms here makes the gate refuse its own tree.
  #
  # A bare `/name` is deliberately NOT a context, and the list's header does not
  # promise one: it fires on `</template>` — a real line of
  # `agent/skills/ui-ux-pro-max/data/stacks/nuxt-ui.csv` — and on `/frontend/` in
  # ordinary prose (measured 2026-10-19 over the 742 published files).
  deny="$deny|${head}(github\.com[:/][A-Za-z0-9._-]+/|repos?[\\/]|~[\\/]|$owner_re/)($ctx)($tail)"
  deny="$deny|${head}($ctx)\.git($bnd|\$)"
fi
[ -n "$plain" ] || { echo "mirror-config: deny list produced no pattern (esc failed?)" >&2; exit 1; }
# Prove the pattern is real before trusting a clean result: it must match a name
# built from its own first alternative. Without this, a broken escape makes the
# gate match nothing and report "clean" — the failure mode this probe exists for.
# The sample is the first name with each `[-_ ]` class collapsed to `-`, so it is
# a real name, not the pattern itself. The delimiters are `/`, which is outside
# the name-character class the boundaries exclude.
probe="$(printf '%s' "$plain" | sed 's/|.*//' | sed 's/\[-_ \]/-/g')"
if ! printf '%s\n' "x/${probe}/x" | grep -qE "$deny"; then
  echo "mirror-config: deny pattern does not match its own first name (${probe}); refusing to run a decorative gate" >&2
  exit 1
fi
# The ctx contexts get the same treatment, one sample per form the list's header
# promises: a construction that drops one — the residual this probe exists for —
# refuses to run instead of certifying a tree with a hole in it.
if [ -n "$ctx" ]; then
  cprobe="$(printf '%s' "$ctx" | sed 's/|.*//' | sed 's/\[-_ \]/-/g')"
  for sample in "github.com/example-owner/$cprobe" "git@github.com:example-owner/$cprobe.git" \
                "repos/$cprobe" "repos\\$cprobe" "~/$cprobe" "~\\$cprobe" "$owner/$cprobe" "$cprobe.git"; do
    if ! printf '%s\n' "x $sample y" | grep -qE "$deny"; then
      echo "mirror-config: the ctx pattern does not match '${sample}', a form the deny list's header promises; refusing to run a decorative gate" >&2
      exit 1
    fi
  done
fi

cd "$here"
git rev-parse --verify -q "refs/tags/$tag" >/dev/null || { echo "mirror-config: no tag $tag" >&2; exit 1; }

# `git ls-tree` on the tag's tree: tracked files only, so no untracked secret can
# be in the list even if the allow-list above is edited carelessly. `-c
# core.quotePath=false` keeps a non-ASCII name literal: the default C-quotes it,
# and the quoted string then matches no path, so `git grep` exits 1 and a real leak
# reads as clean (measured 2026-10-19). The deny list itself is subtracted: it is
# the one file that must name every private repo, and `agent/scripts` is on the
# allow-list, so without this the gate refuses its own tree.
files="$(git -c core.quotePath=false ls-tree -r --name-only "$tag" -- "${paths[@]}" | grep -vxF 'agent/scripts/private-names.txt')"
[ -n "$files" ] || { echo "mirror-config: allow-list matched nothing at $tag" >&2; exit 1; }

# Gate 0 — quoted paths, before anything else reads the list. `core.quotePath=false`
# un-quotes high bytes only: git still C-quotes a name holding a control character,
# a `"` or a backslash, and the quoted string is not a path — it matches no
# pathspec, so `git grep` exits 1 and that file's CONTENT is never scanned
# (reproduced 2026-10-19: a newline in the name, a denied name in the body, gate exit
# 0). Refusing is the fail-closed fix; `-z` would have to be threaded through the
# chunking, the size sum and the staging loop, and a newline in a name breaks this
# newline-delimited list at the next step anyway.
if quoted="$(printf '%s\n' "$files" | grep -n '^"')"; then
  echo "mirror-config: REFUSING to publish $tag — git C-quotes these paths, so no content scan can read them:" >&2
  printf '%s\n' "$quoted" | head -20 >&2
  echo "  Rename the file: a published name may hold no control character, quote or backslash." >&2
  exit 1
fi

# Gate 1 — file modes. A symlink or a gitlink is not a file: `git grep` skips it
# and `git show tag:<link>` prints the link TARGET as content, so a link is a
# publish path that no content scan sees (reproduced 2026-10-19).
modes="$(git ls-tree -r "$tag" -- "${paths[@]}" | awk '$1 !~ /^100[0-7][0-7][0-7]$/ {print $1, $4}')"
if [ -n "$modes" ]; then
  echo "mirror-config: REFUSING to publish $tag — entries that are not regular files:" >&2
  printf '%s\n' "$modes" >&2
  exit 1
fi

# Gate 2 — paths. A private name in a directory or file name publishes just as
# loudly as one in the text, and no content scan sees it.
if path_hits="$(printf '%s\n' "$files" | grep -inE "$deny")"; then
  echo "mirror-config: REFUSING to publish $tag — private names in published PATHS:" >&2
  printf '%s\n' "$path_hits" | head -40 >&2
  exit 1
fi

# Gate 3 — contents. Only the files that would be WRITTEN are scanned, and the
# deny list itself is never among them (it is not on the allow-list). Scanning a
# path instead of the file list is how the first hardened revision refused its
# own tree: `private-names.txt` sits on disk beside the script and names every
# private repo (measured 2026-10-19).
# `git grep` has no `--pathspec-from-file` (that is `git diff`/`git log`), and one
# invocation per file is unusably slow. A single `--` pathspec batch of all 757
# files exceeds the argument limit on Windows and `git grep` exits 126, so the
# list is chunked. xargs exits 123 when any command exits 1..125 and git grep
# exits 1 for "no match", so each chunk's own status is written to a file and the
# worst status seen is what the gate reads. `-i` for case, no `-I` (a binary file
# matching a denied name is still a leak): git exits 1 for "no match", 0 for
# "match", and anything else is a failure that must not pass as clean.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
printf '%s\n' "$files" | grep -v '^$' | awk -v d="$work" '{ print > (d "/chunk." int((NR-1)/150)) }'
# `grep_status` is the WORST status across chunks, and git grep's own convention
# is the sentinel: 1 = no match (clean), 0 = match (a leak), anything else = the
# scan itself failed. Initialising to 0 would report a clean tree as a leak, so
# it starts at 1.
grep_status=1
: > "$work/hits"
for chunk in "$work"/chunk.*; do
  [ -e "$chunk" ] || continue
  mapfile -t batch < <(grep -v '^$' "$chunk")
  # An empty or blank path would make `-- ""` a match-everything pathspec, and
  # git returns 0 with no output for it — a phantom hit (measured 2026-10-19).
  [ "${#batch[@]}" -gt 0 ] || continue
  # `|| s=$?` so a non-zero git grep does not trip `set -e` before the status is
  # read (git exits 1 for "no match", which is the normal case).
  s=0
  # `-a` (--text) forces a binary file to be scanned; `-I` would override it and
  # skip the binary, so a NUL-delimited secret would publish (measured
  # 2026-10-19). `-i` for case.
  git -c grep.lineNumber=true grep -anEi -- "$deny" "$tag" -- "${batch[@]}" >>"$work/hits" 2>/dev/null || s=$?
  case "$s" in
    0) grep_status=0 ;; # a match: the tree leaks
    1) : ;;            # no match: clean for this chunk
    *) grep_status="$s" ;;
  esac
done
hits="$(cat "$work/hits")"
case "$grep_status" in
  0)
    echo "mirror-config: REFUSING to publish $tag — private names in files on the allow-list:" >&2
    printf '%s\n' "$hits" | head -40 >&2
    echo "  $(printf '%s\n' "$hits" | wc -l | tr -d ' ') hit(s). Redact them, or drop the file from the allow-list." >&2
    exit 1
    ;;
  1) : ;; # no match: the only clean exit
  *)
    echo "mirror-config: git grep failed (exit $grep_status); refusing to publish unverified" >&2
    exit 1
    ;;
esac

echo "mirror-config: $tag -> $mirror_dir"
count="$(printf '%s\n' "$files" | wc -l | tr -d ' ')"
# One `ls-tree -l` for every size, rather than a `cat-file` per file: the
# per-file form takes minutes over ~800 paths on Windows and made the dry run
# look hung (measured 2026-10-19).
bytes="$(git ls-tree -r -l "$tag" -- "${paths[@]}" | awk '{s+=$4} END {print s+0}')"
echo "  $count files, $((bytes / 1048576)) MB"
echo "  gate: no private name in any published path or file ($(grep -cvE '^\s*(#|$)' "$deny_file") names checked)"

if [ "$dry" = "--dry-run" ]; then
  printf '%s\n' "$files" | sed 's/^/  /'
  exit 0
fi

# ─── stage into the mirror clone ───────────────────────────────────────────
if [ -d "$mirror_dir/.git" ]; then
  git -C "$mirror_dir" fetch -q --tags origin
  git -C "$mirror_dir" checkout -q main
  git -C "$mirror_dir" reset -q --hard origin/main
else
  git clone -q "$mirror_remote" "$mirror_dir"
fi

# Replace the tree wholesale: the mirror's content is exactly this tag's
# allow-list, so a file dropped from the list disappears rather than lingering.
git -C "$mirror_dir" rm -rq --ignore-unmatch --cached .
find "$mirror_dir" -mindepth 1 -maxdepth 1 -name .git -prune -o -exec rm -rf {} +

printf '%s\n' "$files" | while IFS= read -r f; do
  mkdir -p "$mirror_dir/$(dirname "$f")"
  git -C "$here" show "$tag:$f" > "$mirror_dir/$f"
done

# A README the mirror owns, so the published tree explains itself. Kept out of
# the allow-list on purpose: it is the mirror's, not the harness's.
cat > "$mirror_dir/README.md" <<EOF
# omp-config-mirror

The mechanism half of a private coding-agent harness, published at each release so
that an \`Agent-Identity\` trailer in a commit names the release its tree came from.

Published from \`evanokeefe39/omp-home\` at \`$tag\`. This repo is PRIVATE until
re-publicisation lands (OMP-26), so until then that tag resolves for its owner
only. It is a build artifact: **do not open PRs here** — edit the harness and cut
a release.

Contents: \`agent/skills\`, \`agent/rules\`, \`agent/hooks\`, \`agent/commands\`,
\`agent/extensions\`, \`agent/scripts\`, the agent definitions, the harness
\`AGENTS.md\`, \`WORKFLOWS.md\`, the model and MCP config, and the release files.

Not included: session transcripts, memory trees, usage databases, the defect and
improvement ledgers, audits, retrospectives, and per-agent improvement ledgers —
they name private projects and are not mechanism. Also not included: anything
untracked in the harness, including its \`.env\`.
EOF

git -C "$mirror_dir" add -A
if git -C "$mirror_dir" diff --cached --quiet; then
  echo "mirror-config: nothing to publish (identical to the last run)"
else
  git -C "$mirror_dir" commit -q -m "omp-home $tag"
fi
git -C "$mirror_dir" tag -f "$tag" >/dev/null
git -C "$mirror_dir" push -q origin main
git -C "$mirror_dir" push -qf origin "refs/tags/$tag"
echo "mirror-config: published $tag to $mirror_remote"
