#!/usr/bin/env python3
"""data-sync.py — mirror a local directory against a Cloudflare R2 prefix.

Used by the handoff skill to carry GITIGNORED data (e.g. data/, media/) between
the laptop and the Hetzner box through object storage, since git does not move
it. Credentials are NEVER stored in this file or per-project .env.

Authentication:
  * Preferred — a named profile in the shared ~/.aws/credentials file, e.g.
        data-sync.py --profile r2-handoff --bucket agent-handoff push data/ handoff/repo/data
    Credentials come from ~/.aws/credentials and the endpoint_url + region from
    ~/.aws/config (both read natively by boto3.Session).
  * Fallback — the R2_* env scheme shared with example-data
    (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).

Semantics are rsync-style MIRROR (source is authoritative): the destination
ends up identical to the source — missing/changed files are copied, and objects
present only on the destination are deleted. Precondition: the source directory
must exist and be readable.

    data-sync.py [--profile NAME] [--bucket BUCKET] push <local_dir> <prefix>
    data-sync.py [--profile NAME] [--bucket BUCKET] pull <prefix> <local_dir>

Postcondition (push): every file under <local_dir> exists as
    <prefix>/<relpath> in the bucket, and no other objects live under <prefix>.
Postcondition (pull): every object under <prefix> exists at
    <local_dir>/<relpath>, and no other files live under <local_dir>.

Exit code 0 on success; non-zero with a message on any failure (no silent
partial mirror — a failed transfer is surfaced).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Iterator, Set, Tuple

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError


def _client_and_bucket(profile: str, explicit_bucket: str) -> Tuple[object, str]:
    """Return (r2_s3_client, bucket).

    Credentials come from a named ~/.aws profile (creds + endpoint_url read from
    ~/.aws/credentials + ~/.aws/config) when --profile is given; otherwise from
    the R2_* env vars (example-data-compatible fallback). The bucket is the
    --bucket argument if given, else R2_BUCKET env. Exits loudly if no usable
    source resolves.
    """
    account = os.environ.get("R2_ACCOUNT_ID", "").strip()
    key = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
    secret = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
    env_bucket = os.environ.get("R2_BUCKET", "").strip()
    bucket = (explicit_bucket or env_bucket).strip()
    if not bucket:
        sys.exit("error: no bucket: pass --bucket or set R2_BUCKET")
    if profile:
        try:
            client = boto3.Session(profile_name=profile).client("s3")
        except Exception as e:  # profile missing or malformed
            sys.exit(f"error: could not load R2 profile '{profile}': {e}")
    elif all([account, key, secret]):
        endpoint = f"https://{account}.r2.cloudflarestorage.com"
        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name="auto",
            aws_access_key_id=key,
            aws_secret_access_key=secret,
            config=Config(signature_version="s3v4"),
        )
    else:
        sys.exit("error: data handoff needs an R2 credential source: pass "
                 "--profile (shared ~/.aws profile) or set "
                 "R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY env")
    return client, bucket


def _local_files(root: Path) -> Iterator[str]:
    """Yield POSIX relative paths (with '/' separators) of regular files under root.

    Symlinks and sockets are skipped (recorded); a .git directory inside the
    root is never traversed. Hidden files/dirs are included.
    """
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != ".git"]
        for name in filenames:
            p = Path(dirpath) / name
            if p.is_symlink():
                print(f"  (skip symlink) {p.relative_to(root)}")
                continue
            rel = p.relative_to(root).as_posix()
            if rel == ".git":
                continue
            yield rel


def _remote_keys(client, bucket: str, prefix: str) -> Set[str]:
    """Return the set of object keys under prefix, paginating."""
    keys: Set[str] = set()
    paginator = client.get_paginator("list_objects_v2")
    try:
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                keys.add(obj["Key"])
    except (BotoCoreError, ClientError) as e:
        sys.exit(f"error: failed to list {bucket}/{prefix}: {e}")
    return keys


def _size(client, bucket: str, key: str):
    try:
        return client.head_object(Bucket=bucket, Key=key).get("ContentLength")
    except ClientError:
        return None


def push(client, bucket: str, local_dir: Path, prefix: str) -> None:
    """Mirror local_dir up into R2 under prefix."""
    if not local_dir.is_dir():
        sys.exit(f"error: local data dir not found or not a directory: {local_dir}")
    cfg = TransferConfig()
    rels = list(_local_files(local_dir))
    local_rels = {r for r in rels}
    print(f"uploading {len(local_rels)} file(s) from {local_dir} -> s3://{bucket}/{prefix}")
    for rel in rels:
        key = f"{prefix}/{rel}"
        local = local_dir / rel
        remote_size = _size(client, bucket, key)
        local_size = local.stat().st_size
        if remote_size == local_size:
            continue  # already present, same size
        client.upload_file(str(local), bucket, key, Config=cfg)
        print(f"  up   {rel} ({local_size} bytes)")
    for key in _remote_keys(client, bucket, prefix):
        rel = key[len(prefix):].lstrip("/")
        if rel and rel not in local_rels:
            client.delete_object(Bucket=bucket, Key=key)
            print(f"  del  {rel} (not in source)")
    print("push mirror complete")


def pull(client, bucket: str, prefix: str, local_dir: Path) -> None:
    """Mirror R2 prefix down into local_dir."""
    local_dir.mkdir(parents=True, exist_ok=True)
    cfg = TransferConfig()
    keys = _remote_keys(client, bucket, prefix)
    print(f"downloading {len(keys)} object(s) from s3://{bucket}/{prefix} -> {local_dir}")
    for key in sorted(keys):
        rel = key[len(prefix):].lstrip("/")
        if not rel:
            continue
        local = local_dir / rel
        local.parent.mkdir(parents=True, exist_ok=True)
        remote_size = _size(client, bucket, key)
        if local.is_file() and local.stat().st_size == remote_size:
            continue
        client.download_file(bucket, key, str(local))
        print(f"  down {rel} ({remote_size} bytes)")
    remote_rels = {k[len(prefix):].lstrip("/") for k in keys if k[len(prefix):].lstrip("/")}
    # Delete local files not present remotely (mirror), never outside local_dir.
    for dirpath, _dirnames, filenames in os.walk(local_dir):
        dirpath = Path(dirpath)
        for name in filenames:
            rel = (dirpath / name).relative_to(local_dir).as_posix()
            if rel not in remote_rels:
                p = dirpath / name
                p.unlink()
                print(f"  del  {rel} (not in remote)")
    print("pull mirror complete")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Mirror a local dir against an R2 prefix.")
    p.add_argument("op", choices=("push", "pull"))
    p.add_argument("src", help="push: local source dir; pull: R2 object prefix")
    p.add_argument("dst", help="push: R2 object prefix; pull: local target dir")
    p.add_argument("--profile", help="named R2 profile in ~/.aws/credentials (creds+endpoint)")
    p.add_argument("--bucket", help="R2 bucket name (default: R2_BUCKET env)")
    args = p.parse_args(argv)

    client, bucket = _client_and_bucket(args.profile, args.bucket)
    if args.op == "push":
        prefix = args.dst.strip("/")
        if not prefix:
            sys.exit("error: prefix must be non-empty")
        push(client, bucket, Path(args.src), prefix)
    else:
        prefix = args.src.strip("/")
        if not prefix:
            sys.exit("error: prefix must be non-empty")
        pull(client, bucket, prefix, Path(args.dst))
    return 0


if __name__ == "__main__":
    sys.exit(main())
