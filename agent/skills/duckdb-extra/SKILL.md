---
name: duckdb-extra
description: >
  DuckDB warehouse write-path hardening the vendor duckdb skill does not cover —
  single-writer serialization, the bulk-write pattern (chunked multi-VALUES or
  staging + INSERT ... SELECT, never per-row executemany), and the layering rule
  (never store derived columns on raw). Load ALONGSIDE the vendor `skill://duckdb`
  whenever writing bulk/load code against DuckDB in a warehouse, not instead of
  it — the vendor skill is the canonical query/read reference; this adds the
  write/warehouse discipline.
---

# DuckDB warehouse write-path hardening

Companion to the vendor `duckdb` skill. The vendor skill is the canonical query
and read reference; this skill adds the **write-path and warehouse** discipline
the vendor skill does not carry. Read both whenever you bulk-load or write to
DuckDB.

## Single-writer serialization

DuckDB is **single-writer**: never run parallel writers against the same `.db`
or you get a lock error. Serialize writes. Never let a parallel/partial process
leave derived rows that look current — self-version derived data so stale state
under old logic is detectable.

## Bulk-write pattern — never per-row executemany

`conn.executemany` autocommits per row at ~24 ms/row — a 100k-row load takes
~40 minutes. **Never** use it for bulk loads.

- Insert via **chunked multi-VALUES `INSERT ... OR REPLACE` inside ONE
  transaction**, OR a **staging table + `INSERT ... SELECT`** — ~140x faster
  (200k rows in ~34 s).
- If the repo has a shared helper (e.g. `defs/common/bulk.bulk_upsert`), use it.
- Loads are idempotent by natural key (`INSERT ... OR REPLACE`) so re-runs never
  corrupt state.

## Layering rule

Bronze/raw = as-observed. **Never** store derived columns (aggregates like
LOC/file_count) on raw — derive them at the layer that owns the derivation.
A derived column on raw bloats the scan, repeats computation, and breaks the
raw-layer contract.

## Measure before you optimize

When a load is reported slow, time each stage (scan vs parse vs write) before
fixing the suspected one — the wall is often the DuckDB write path, not the
source scan.
