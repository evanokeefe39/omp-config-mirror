"""Stage this repo's OMP config for a Harbor trial.

Copies the config surface only — no runtime state, no session transcripts — so a
trial uploads tens of megabytes instead of gigabytes. The default source is the
``agent/`` directory beside this script — the live harness directory when the repo
is ``~/.omp``, and a worktree's or clone's own copy otherwise — and the default
destination is ``.staged/omp-agent``, which is gitignored. Both are overridable,
and the staged tree must fit the ``--max-mb`` budget::

    python agent/scripts/stage_omp_config.py --dry-run   # list what would be copied
    python agent/scripts/stage_omp_config.py
    python agent/scripts/stage_omp_config.py --exclude audits --exclude docs

``--eval`` applies ``EVAL_EXCLUDED_PATHS`` and prints every drop with its reason,
so a prune is never silent::

    python agent/scripts/stage_omp_config.py --eval --dest .staged/omp-agent-eval

Then point a job config at the result::

    agents:
      - name: harbor_omp:Omp
        kwargs:
          config_dir: .staged/omp-agent
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from collections.abc import Callable, Iterable
from pathlib import Path, PurePosixPath

# The repo this script ships in *is* the config: `agent/` beside it is the live
# harness directory when the repo is `~/.omp`, and a worktree or a clone stages its
# own copy. Resolved from the script, so it is never a hard-coded home.
DEFAULT_SOURCE = Path(__file__).resolve().parents[1]
DEFAULT_DEST = Path(".staged") / "omp-agent"

# Runtime directories at the source root: transcript trees, caches and the
# SQLite state omp holds open while it runs. Matched only at the root, because a
# directory of the same name deeper in the tree is config.
RUNTIME_DIRS = frozenset(
    {"sessions", "blobs", "cache", "logs", "terminal-sessions", "playbook-probe"}
)
# Matched at ANY depth, unlike RUNTIME_DIRS: a cache marker or SQLite file is
# runtime state wherever a config nests it.
RUNTIME_FILES = frozenset({"last-changelog-version"})
RUNTIME_SUFFIXES = (".db", ".db-shm", ".db-wal")

# Secret material, excluded unless ``--with-secrets``: Harbor injects the model
# credential itself.
SECRET_FILES = frozenset({".env", "secret-placeholder.key"})

# What an eval does not need: a source-root-relative path, and the reason it is
# dropped, which is printed with the path. Paths, never basenames.
EVAL_EXCLUDED_PATHS: dict[str, str] = {
    "extensions/herdr-omp-agent-state.ts": (
        "herdr's managed integration — inert in a container, and its own header "
        "says a reinstall overwrites it, so it is excluded rather than edited"
    ),
    "extensions/playbook-probe/index.ts": (
        "the playbook probe is a host-side diagnostic, not part of an eval"
    ),
    "extensions/omp-identity.ts": (
        "its `Agent-Identity:` harness trailer cannot resolve in a container, "
        "and omp/model duplicate result.json's agent_info"
    ),
    "mcp.json": "an eval declares no MCP servers, so the live home's are not staged",
    ".harbor-config.json": (
        "a trial's provenance record, not config: staging it would tell the agent "
        "under test it is being evaluated (OAV-4)"
    ),
}

DEFAULT_MAX_MB = 200.0


def _rel_path(value: str) -> str:
    """Normalise a source-root-relative path to the one spelling rules compare.

    Either separator is accepted, and empty and ``.`` segments are dropped, so
    ``./rules/style.md`` and ``rules/style.md`` are the same path.
    """
    parts = [p for p in value.replace("\\", "/").split("/") if p not in ("", ".")]
    return PurePosixPath(*parts).as_posix()


def _excluded(
    rel: PurePosixPath,
    *,
    is_dir: bool,
    with_secrets: bool,
    extra_names: frozenset[str],
    extra_paths: frozenset[str],
) -> bool:
    """Report whether this entry would be skipped.

    ``rel`` is the entry's path *relative to the source root*, which is what the
    root-only runtime rules judge. ``extra_names`` is the deliberate any-depth
    escape (``--exclude``); ``extra_paths`` is the precise one
    (``--exclude-path``).
    """
    if rel.name in extra_names:
        return True
    if rel.as_posix() in extra_paths:
        return True
    if len(rel.parts) == 1 and is_dir and rel.name in RUNTIME_DIRS:
        return True
    if rel.name in RUNTIME_FILES or rel.name.endswith(RUNTIME_SUFFIXES):
        return True
    return rel.name in SECRET_FILES and not with_secrets


def _ignore_factory(
    source: Path,
    *,
    with_secrets: bool,
    extra_names: frozenset[str],
    extra_paths: frozenset[str],
) -> Callable[[str, list[str]], list[str]]:
    """Return a ``copytree`` ignore callback that judges an entry by its path.

    ``copytree`` hands the callback the directory it is walking, so every
    candidate can be named relative to the source root — which is what tells the
    root ``playbook-probe`` log directory apart from a config directory sharing
    its name.
    """

    def ignore(directory: str, names: list[str]) -> list[str]:
        rel_dir = PurePosixPath(*Path(os.path.relpath(directory, source)).parts)
        return [
            name
            for name in names
            if _excluded(
                rel_dir / name,
                is_dir=(Path(directory) / name).is_dir(),
                with_secrets=with_secrets,
                extra_names=extra_names,
                extra_paths=extra_paths,
            )
        ]

    return ignore


def _size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def _plan(
    source: Path,
    *,
    with_secrets: bool,
    extra_names: frozenset[str],
    extra_paths: frozenset[str],
) -> list[tuple[str, int]]:
    """Top-level entries that would be copied, with their sizes, largest first."""
    planned = [
        (entry.name, _size(entry))
        for entry in sorted(source.iterdir())
        if not _excluded(
            PurePosixPath(entry.name),
            is_dir=entry.is_dir(),
            with_secrets=with_secrets,
            extra_names=extra_names,
            extra_paths=extra_paths,
        )
    ]
    planned.sort(key=lambda item: item[1], reverse=True)
    return planned


def _human(size: int) -> str:
    return f"{size / 1e6:.1f} MB" if size >= 1e6 else f"{size / 1e3:.1f} kB"


def _walked_rel_paths(source: Path) -> set[str]:
    """Return every entry path the copy walk considers, source-root-relative.

    An exclusion only drops something if the walk spells the path the same way,
    which is a different question from whether the path exists on disk:
    ``extensions/../mcp.json`` resolves, but the walk never names it.
    """
    walked: set[str] = set()
    for directory, dirnames, filenames in os.walk(source):
        rel_dir = PurePosixPath(*Path(os.path.relpath(directory, source)).parts)
        for name in dirnames + filenames:
            walked.add((rel_dir / name).as_posix())
    return walked


def _prune_emptied_dirs(source: Path, dest: Path) -> list[str]:
    """Remove directories a drop emptied, deepest first.

    ``copytree`` creates a directory and then ignores the file inside it, so a
    drop would leave an empty remnant that looks like an accidental one. A
    directory that is empty in the *source* is left alone: that one is config.
    """
    removed: list[str] = []
    for directory in sorted(
        (path for path in dest.rglob("*") if path.is_dir()), reverse=True
    ):
        rel = directory.relative_to(dest)
        if any(directory.iterdir()) or not any((source / rel).iterdir()):
            continue
        directory.rmdir()
        removed.append(rel.as_posix())
    return removed


def main(argv: Iterable[str]) -> int:
    """Stage the config surface named on the command line into ``--dest``."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST)
    parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        metavar="NAME",
        help=(
            "Extra entry name to skip, matched at ANY depth — a basename, not a "
            "path. Use --exclude-path for a precise drop. Repeatable."
        ),
    )
    parser.add_argument(
        "--exclude-path",
        action="append",
        default=[],
        metavar="REL",
        help=(
            "Extra path to skip, relative to the source root, e.g. "
            "extensions/playbook-probe/index.ts. May name a file or a "
            "directory. Repeatable."
        ),
    )
    parser.add_argument(
        "--eval",
        action="store_true",
        help=(
            "Drop what an eval does not need (EVAL_EXCLUDED_PATHS) instead of "
            "copying the whole config surface. Each drop is printed."
        ),
    )
    parser.add_argument(
        "--with-secrets",
        action="store_true",
        help="Include .env and the key placeholder file.",
    )
    parser.add_argument(
        "--max-mb",
        type=float,
        default=DEFAULT_MAX_MB,
        help=f"Refuse to stage more than this (default: {DEFAULT_MAX_MB}).",
    )
    parser.add_argument("--force", action="store_true", help="Ignore --max-mb.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be copied, copy nothing.",
    )
    args = parser.parse_args(list(argv))

    source: Path = args.source.expanduser()
    if not source.is_dir():
        print(f"error: source is not a directory: {source}", file=sys.stderr)
        return 2

    exclusions: dict[str, str] = EVAL_EXCLUDED_PATHS if args.eval else {}
    extra_names = frozenset(args.exclude)
    extra_paths = frozenset(
        {_rel_path(path) for path in exclusions}
        | {_rel_path(path) for path in args.exclude_path}
    )
    planned = _plan(
        source,
        with_secrets=args.with_secrets,
        extra_names=extra_names,
        extra_paths=extra_paths,
    )
    total = sum(size for _, size in planned)

    print(f"source: {source}")
    print(f"dest:   {args.dest}")
    print(f"eval exclusions: {'on' if args.eval else 'off'}")
    # Named before anything is copied, so a rule that stopped applying cannot
    # look like one that works.
    walked = _walked_rel_paths(source)
    for rel, why in exclusions.items():
        absent = "" if _rel_path(rel) in walked else "  (not in source)"
        print(f"  dropping {rel}: {why}{absent}")
    for value in args.exclude_path:
        if _rel_path(value) not in walked:
            print(
                f"warning: --exclude-path {value} is not in the source; "
                "it dropped nothing",
                file=sys.stderr,
            )
    print(f"copying {len(planned)} top-level entries, {_human(total)} total")

    for name, size in planned[:10]:
        print(f"  {size:>12,}  {name}")
    if len(planned) > 10:
        print(f"  ... and {len(planned) - 10} more")

    if total > args.max_mb * 1e6 and not args.force:
        print(
            f"\nerror: {_human(total)} exceeds the {args.max_mb:.0f} MB budget. "
            "Add --exclude NAME for the entries above that are not configuration, "
            "or raise --max-mb if the size is intended.",
            file=sys.stderr,
        )
        return 1

    if args.dry_run:
        print("\ndry run: nothing copied")
        return 0

    dest: Path = args.dest
    if dest.exists():
        shutil.rmtree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        source,
        dest,
        ignore=_ignore_factory(
            source,
            with_secrets=args.with_secrets,
            extra_names=extra_names,
            extra_paths=extra_paths,
        ),
    )
    for rel in _prune_emptied_dirs(source, dest):
        print(f"  removed the directory {rel}, which a drop emptied")
    written = _size(dest)
    print(f"\nstaged {_human(written)} to {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
