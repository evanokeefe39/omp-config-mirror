"""Build a byte-stable archive of an OMP config root, for the ``config_url`` path.

The archive wraps one directory holding ``agent/`` and whatever else sits at the
config root, because ``Omp``'s ``config_url`` branch extracts it with ``tar
--strip-components=1``. Point it at a config *root* (a directory containing
``agent/``), not a bare agent directory::

    python agent/scripts/stage_omp_config.py --dest <root>/agent
    python agent/scripts/build_config_archive.py <root> <out.tar.gz>
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import shutil
import sys
import tarfile
import tempfile
from pathlib import Path


def _normalize(member: tarfile.TarInfo) -> tarfile.TarInfo:
    member.mtime = 0
    member.uid = member.gid = 0
    member.uname = member.gname = ""
    return member


def build_config_archive(
    config_root: Path, dest_dir: Path, name: str = "omp-config-root"
) -> tuple[Path, str]:
    """Write ``<name>.tar.gz`` under ``dest_dir``; return ``(path, sha256)``.

    Archives a private copy of ``config_root``, removed afterwards, so a
    concurrent writer cannot change the archive mid-read. The digest is stable
    for the same input on the same platform: file modes are kept, and they feed
    the digest. Raises ``SystemExit`` when it is not a directory containing
    ``agent/``.
    """
    if not config_root.is_dir():
        raise SystemExit(f"config root is not a directory: {config_root}")
    if not (config_root / "agent").is_dir():
        raise SystemExit(
            f"{config_root} has no agent/ directory. Pass a staged config *root* "
            "(a directory containing agent/), not a bare agent directory."
        )

    dest_dir.mkdir(parents=True, exist_ok=True)
    buffer = io.BytesIO()
    # TemporaryDirectory clears read-only bits before unlinking, which a bare
    # rmtree of a copied read-only file cannot do on Windows.
    with tempfile.TemporaryDirectory(dir=dest_dir) as scratch:
        staging = Path(scratch) / name
        shutil.copytree(config_root, staging)
        with tarfile.open(fileobj=buffer, mode="w") as tar:
            for path in sorted(staging.rglob("*")):
                # POSIX separators only: the archive is extracted on Linux, where a
                # backslash is a literal filename byte.
                arcname = f"{name}/{path.relative_to(staging).as_posix()}"
                tar.add(
                    path,
                    arcname=arcname,
                    filter=_normalize,
                    recursive=False,
                )

    archive = dest_dir / f"{name}.tar.gz"
    with gzip.GzipFile(archive, "wb", mtime=0) as gz:
        gz.write(buffer.getvalue())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    return archive, digest


def main(argv: list[str]) -> int:
    """Build the archive named on the command line and print its digest."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "config_root",
        type=Path,
        help="staged config root — a directory containing agent/",
    )
    parser.add_argument("target", type=Path, help="output .tar.gz path")
    parser.add_argument(
        "--name",
        default=None,
        help="wrapping directory name inside the archive (default: the target's stem)",
    )
    args = parser.parse_args(argv[1:])

    name = args.name or args.target.name.removesuffix(".tar.gz").removesuffix(".tgz")
    archive, digest = build_config_archive(
        args.config_root, args.target.parent, name=name
    )
    if archive != args.target:
        shutil.move(archive, args.target)
    print(f"{args.target}  sha256={digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
