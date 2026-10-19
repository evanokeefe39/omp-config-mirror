"""Synthetic change under review — deliberately bad; never fix this file in place.

The code carries the violations the probe expects to be caught:
- retries 403 unconditionally (no documented quota signal, no budget)
- ignores Retry-After; no backoff shape, no cap, no jitter, no budget
- retries POST with no idempotency key declared
- one shared default timeout instead of per-source connect/read timeouts
- stores only parsed rows — no raw record landed before parsing
- no per-source guardrail; an empty 200 silently stores nothing
- transport failures retried on the same loop with no unreachable classification
"""

import httpx


def fetch_listings(url: str, rows: list[dict]) -> None:
    """Fetch every listing page and store the parsed rows only."""
    with httpx.Client(timeout=10) as client:
        for attempt in range(10):
            try:
                response = client.post(url, json={"page": attempt})
            except httpx.TransportError:
                continue
            if response.status_code in (403, 429, 500, 503):
                continue
            if response.status_code == 200:
                for item in response.json()["items"]:
                    rows.append({"title": item["title"], "url": item["url"]})
                return
