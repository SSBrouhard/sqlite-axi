---
name: sqlite-axi
description: >
  Use when you need to inspect or query a local SQLite database — list tables,
  see a table's columns/keys/indexes, preview rows, or run a read-only SELECT.
  Token-efficient TOON output. Read-only; no writes are possible.
---

# sqlite-axi

`sqlite-axi` is an [AXI](https://github.com/kunchenguid/axi) for SQLite. It opens databases
**read-only** and returns token-efficient TOON. The database is auto-discovered in the current
directory, or passed as a file path / `--db`.

Run without a global install:

```sh
npx -y sqlite-axi <command>
```

## Commands

- `sqlite-axi tables` — tables with row and column counts.
- `sqlite-axi schema <table>` — columns (type, pk, notnull, default), indexes, foreign keys.
- `sqlite-axi sample <table> [--limit 10] [--full]` — preview rows; cells truncate unless `--full`.
- `sqlite-axi query "<sql>" [--limit 50] [--full]` — a single read-only query
  (`SELECT` / `EXPLAIN SELECT` / `EXPLAIN QUERY PLAN SELECT` only).

## Notes

- Read-only is enforced two ways: the file is opened with SQLite's read-only flag, and a
  validator rejects anything but the allowed read statements.
- Errors are structured TOON on stdout with a `help` line. Exit codes: `0` ok, `1` error,
  `2` usage/read-only violation.
- Unknown table → `NOT_FOUND` suggesting `sqlite-axi tables`.
