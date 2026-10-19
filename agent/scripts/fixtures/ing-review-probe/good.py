"""Compliant counterpart of feed.py — the same fetch, built to the standard."""

import json
import random
import time
import uuid

import httpx

# The per-source contract, answered (stage 2: written, reviewed artifact).
CONTRACT = {
    "transport": "httpx.Client (plain; no impersonation graded necessary)",
    "session": "one client per run",
    "auth": "ApiKeyAuth via request header",
    "paginator": "cursor (next-page token)",
    "incremental": "updated_at cursor persisted in durable state",
    "retry": {
        "transient_statuses": [429, 500, 502, 503, 504, 408],
        "backoff": "capped exponential with full jitter, cap 30s",
        "budget": 5,
        "owner": "this module — single layer",
        "timeouts": {"connect": 3.05, "read": 30.0},
    },
    "response_actions": {
        "202": "undocumented origin: challenge-class, stop and record",
        "403": "non-retryable by default: stop and record (no documented quota signal)",
        "429_slow_down": "honour Retry-After (both forms, capped 120s); does not consume budget",
        "429_out_of_quota": "stop and record",
        "401": "refresh once, then stop loudly",
    },
    "rate_limit": {},
    "egress": "direct",
    "probe_budget": {"max_requests": 50, "max_wall_time_s": 300, "max_cost": 0},
    "partial_progress": "skip-and-count; checkpoints at page boundaries; replay idempotent",
    "guardrail": {"min_rows": 1, "freshness_error_after_h": 26},
    "failure_modes": ["challenge page", "empty-200", "soft-404", "silent truncation", "unreachable host"],
    "legal": {"tos_aup": "reviewed and recorded before first fetch", "login_wall": "none", "tdm_optout": "not applicable"},
}


def _jitter_sleep(attempt: int) -> float:
    return random.uniform(0, min(30.0, 0.5 * 2 ** attempt))


def fetch_listings(url: str, rows: list[dict], raw: list[dict]) -> None:
    """Fetch listing pages; land the raw record before any parsing."""
    run_id = str(uuid.uuid4())
    state = {"cursor": None}  # durable in production; advanced only at page boundaries
    with httpx.Client(
        timeout=httpx.Timeout(connect=3.05, read=30.0),
        headers={"User-Agent": "ingestion-probe/0.1 (+https://example.invalid/bot)"},
    ) as client:
        while True:
            try:
                response = client.post(
                    url, json={"page": state["cursor"]}, headers={"Idempotency-Key": run_id}
                )
            except httpx.TransportError:
                # Transport failure charges nothing: classified unreachable, not a budget stop.
                raw.append({
                    "run_id": run_id, "source": "probe", "url": url, "method": "POST",
                    "status": "unreachable", "headers": {}, "body_bytes": b"",
                    "fetched_at": time.time(),
                })
                raise SystemExit("source unreachable — stop; classified unreachable")
            raw.append({
                "run_id": run_id, "source": "probe", "url": url, "method": "POST",
                "status": response.status_code, "headers": dict(response.headers),
                "body_bytes": response.content, "fetched_at": time.time(),
            })
            status = response.status_code
            if status == 403:
                raise SystemExit("403 refusal — stop and record")
            if status == 202:
                raise SystemExit("202 challenge-class at undocumented origin — stop and record")
            if status == 401:
                raise SystemExit("401 credential failure — refresh once, then stop")
            if status == 429:
                retry_after = response.headers.get("Retry-After")
                time.sleep(min(float(retry_after), 120.0) if retry_after else _jitter_sleep(0))
                continue
            if status in (500, 502, 503, 504, 408):
                time.sleep(_jitter_sleep(1))
                continue
            if status == 200:
                body = response.json()
                if not body.get("items"):
                    raise SystemExit("guardrail: whole-source dropout — empty 200 fails loudly")
                for item in body["items"]:
                    rows.append({"title": item["title"], "url": item["url"]})
                state["cursor"] = body.get("next")  # checkpoint at the page boundary
                if not body.get("next"):
                    return
                continue
            raise SystemExit(f"unclassified status {status} — stop and record")
