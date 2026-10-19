#!/bin/sh
#
# install-git-hooks — put this repo's git-hook sources where git actually runs
# them.
#
# The hooks live outside the repo (`core.hooksPath` points at `~/.git-hooks`, on
# purpose: lefthook's wrappers for commit-msg / pre-commit / pre-push are already
# there). An unversioned hook drifts and cannot be reviewed, so the SOURCE lives
# in the repo at `agent/scripts/git-hooks/` and this installer copies it out.
#
#   agent/scripts/install-git-hooks.sh          install
#   agent/scripts/install-git-hooks.sh --check  report only, copy nothing
#
# Idempotent: a file already identical to the source is left alone. A file that
# DIFFERS is only overwritten when it carries this repo's "managed by omp:"
# marker — anything else is someone else's hook and is refused loudly, by name,
# with a non-zero exit. The install is also not silent about being ineffective:
# if `core.hooksPath` does not point at the install directory, no hook installed
# here will ever run, so that is reported as a failure rather than printed and
# forgotten.
#
# Known gap, deliberate: 18 of the 169 repos under ~/repos set their own
# `core.hooksPath`, and git honours the local value. This installer cannot reach
# them; each such repo would have to point at (or copy) the source itself.

set -eu

marker="managed by omp:"
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
src_dir="$script_dir/git-hooks"
dest_dir="${HOME:-${USERPROFILE:-}}/.git-hooks"
check_only=0

case "${1:-}" in
  --check) check_only=1 ;;
  "") ;;
  *)
    echo "install-git-hooks: unknown argument '$1' (only --check is accepted)" >&2
    exit 2
    ;;
esac

if [ -z "${HOME:-${USERPROFILE:-}}" ]; then
  echo "install-git-hooks: neither HOME nor USERPROFILE is set — cannot locate the hooks directory" >&2
  exit 1
fi

if [ ! -d "$src_dir" ]; then
  echo "install-git-hooks: no hook sources at $src_dir" >&2
  exit 1
fi

echo "install-git-hooks: source $src_dir"
echo "install-git-hooks: target $dest_dir"

if [ "$check_only" = "0" ]; then
  mkdir -p "$dest_dir"
fi

installed=0
unchanged=0
refused=0

for src in "$src_dir"/*; do
  [ -f "$src" ] || continue
  name=$(basename "$src")
  dest="$dest_dir/$name"

  if [ -f "$dest" ] && cmp -s "$src" "$dest"; then
    echo "  unchanged  $name"
    unchanged=$((unchanged + 1))
    continue
  fi

  if [ -f "$dest" ] && ! grep -q "$marker" "$dest" 2>/dev/null; then
    echo "  REFUSED    $name — $dest differs and does not carry the '$marker' marker." >&2
    echo "             It is not ours to overwrite. Move it aside, or install by hand." >&2
    refused=$((refused + 1))
    continue
  fi

  if [ "$check_only" = "1" ]; then
    if [ -f "$dest" ]; then
      echo "  stale      $name — would be replaced"
    else
      echo "  missing    $name — would be installed"
    fi
    installed=$((installed + 1))
    continue
  fi

  cp "$src" "$dest"
  chmod +x "$dest" 2>/dev/null || true
  echo "  installed  $name -> $dest"
  installed=$((installed + 1))
done

# A hook that git never runs is an install that did nothing. `core.hooksPath` is
# global config, so it is only ever set when it is unset — an existing value,
# including one pointing somewhere else on purpose, is never clobbered.
hooks_path=$(git config --global --get core.hooksPath 2>/dev/null || true)
hooks_path_ok=0
if [ -n "$hooks_path" ]; then
  resolved_hooks=$(cd "$hooks_path" 2>/dev/null && pwd || true)
  resolved_dest=$(cd "$dest_dir" 2>/dev/null && pwd || true)
  if [ -n "$resolved_dest" ] && [ "$resolved_hooks" = "$resolved_dest" ]; then
    hooks_path_ok=1
  fi
fi

if [ "$hooks_path_ok" = "1" ]; then
  echo "  core.hooksPath already $dest_dir"
elif [ -z "$hooks_path" ]; then
  if [ "$check_only" = "1" ]; then
    echo "  core.hooksPath is UNSET — would be set to $dest_dir" >&2
    hooks_path_ok=0
  else
    git config --global core.hooksPath "$dest_dir"
    echo "  set core.hooksPath $dest_dir (was unset)"
    hooks_path_ok=1
  fi
else
  echo "  REFUSED    core.hooksPath is '$hooks_path', not '$dest_dir'." >&2
  echo "             Existing global config is not overwritten; decide which one should win." >&2
fi

echo "install-git-hooks: $installed to write, $unchanged already current, $refused refused"
# `--check` answers "is this machine current?", so anything to write is a NO. The
# missing-file case used to exit 0 here while printing `1 to write`, and a caller
# gating on the exit code would read a machine with no hook at all as set up.
if [ "$check_only" = "1" ] && [ "$installed" != "0" ]; then
  echo "install-git-hooks: NOT CURRENT — $installed file(s) would be written" >&2
  exit 1
fi
if [ "$hooks_path_ok" = "0" ]; then
  echo "install-git-hooks: FAILED — hooks are installed at $dest_dir but git will not run them" >&2
  exit 1
fi
if [ "$refused" != "0" ]; then
  echo "install-git-hooks: FAILED — $refused file(s) refused; nothing there was touched" >&2
  exit 1
fi
exit 0
