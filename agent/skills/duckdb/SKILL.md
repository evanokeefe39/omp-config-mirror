---
name: duckdb
description: >
  DuckDB for structured data queries — CSV, JSON, JSONL, Parquet, SQLite.
  Use OMP's built-in grep and glob for text search and file finding;
  they're already ripgrep and fd in-process. Only reach for DuckDB when
  you need SQL: aggregates, joins, window functions, cross-format queries,
  or exploration of structured files.
alwaysApply: true
---

# DuckDB

**OMP's built-in `grep` and `glob` are ripgrep and fd in-process. Use them.**
DuckDB is for structured data only — when you need SQL.

Binary: `duckdb` (on PATH — DuckDB 1.4.3 at `~/.local/bin/duckdb.exe`).
Version matters: query errors exit **non-zero** on >=1.4 but exit **0** on the old
1.2.1 CLI formerly at `~/repos/unified-search/bin/` — do not use that path.

## When to use duckdb over grep

| OMP's grep can't do this | duckdb can |
|---------------------------|------------|
| "How many rows in this CSV?" | `SELECT count(*) FROM read_csv_auto('data.csv')` |
| "Average price by category" | `SELECT category, avg(price) FROM ... GROUP BY 1` |
| "Join users.csv with orders.jsonl" | `SELECT ... FROM read_csv_auto(...) JOIN read_json_auto(...)` |
| "What columns does this Parquet have?" | `SUMMARIZE read_parquet('file.parquet')` |
| "BM25-ranked full-text search" | `SELECT *, fts_main_data.match_bm25(...) FROM ...` |

## Quick reference

```bash
# Explore an unfamiliar dataset
duckdb -c "SUMMARIZE read_csv_auto('unknown.csv')"
duckdb -c "SELECT json_keys(data) FROM read_json_auto('nested.jsonl') LIMIT 1"

# Query structured data
duckdb -c "SELECT count(*), avg(score) FROM read_csv_auto('data.csv') WHERE score > 0.5"
duckdb -c "SELECT * FROM read_parquet('users.parquet') LIMIT 10"

# Cross-format joins
duckdb -c "
  SELECT u.name, o.total
  FROM read_csv_auto('users.csv') u
  JOIN read_json_auto('orders.jsonl') o ON u.id = o.user_id
"
```

## Pitfalls

- **Windows paths**: Use `C:/Users/...` format, not `/c/Users/...`.
- **Flatten SQL to one line** when the default shell is cmd.exe.
- **Never use duckdb `glob()` for file discovery** — OMP's glob tool is 100x faster. Discover with OMP's `glob`, query with duckdb.
- **Multi-CSV with different schemas**: Use `union_by_name=true` to handle column mismatches.

Full duckdb patterns: `~/repos/unified-search/vendor/duckdb-skills/`
