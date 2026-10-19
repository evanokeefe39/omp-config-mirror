---
name: pb-data-schema-migration
description: "Change ONE schema (DuckDB/SQLite) via a migration that ships with its code - Alembic owns DDL, additive-only by default, read every pending migration before applying, verified on a COPY of the store (apply + read/write paths + row counts), never the live store first."
---
## When

A schema, DDL or persisted-state change in a data store.

Not: transform logic or contract semantics; a schema change belonging to a
new source's onboarding (`pb-data-source-onboarding`); a data-quality
failure on an existing shape (`pb-data-quality-incident`).

Use for schema/DDL/persisted-state changes; not for transform logic or contract
semantics.

## Outcome

One schema changed by a migration that ships with its code, additive-only by
default, verified on a copy of the store before the live one.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- The migration ships in the same change as the code that needs the new shape
- The copy-restore drill ran: the migration applied and the row counts and nullability held
- The migration README inventory lists the new migration, and nothing was applied to the live store first
- Reply: the objects the change touches and their consumer classes, the migration's DDL regime, and the copy-verification result.
