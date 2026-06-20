# sqlite-axi — Design

**Date:** 2026-06-19
**Author:** SSBrouhard

## Summary

`sqlite-axi` is an [AXI](https://github.com/kunchenguid/axi) (Agent eXperience Interface): an
agent-native CLI that **inspects and queries SQLite databases read-only**, with token-efficient
TOON output. It auto-discovers the database in the current directory, so running `sqlite-axi`
with no arguments prints a compact schema snapshot. Built on `axi-sdk-js` (TOON serialization,
dispatch, structured errors, session hooks).

The leverage: agents are fluent at SQL but wasteful with its output — `SELECT *` dumps walls of
JSON and schema gets re-described every session. A capped, TOON-formatted result set plus a
compact schema snapshot is a large token win, and read-only access sidesteps all mutation risk.

## Driver

**`better-sqlite3`** (v12, requires Node ≥20). Synchronous API, ships prebuilt binaries.

Open sequence (gives both clean AXI errors and a hard read-only guarantee):

```ts
import { statSync } from "node:fs";
import Database from "better-sqlite3";

// 1. Clean NOT_FOUND — do NOT rely on `fileMustExist`, which is ignored on
//    read-only connections (better-sqlite3 API docs).
if (!statSync(path, { throwIfNoEntry: false })?.isFile()) throw notFound(path);

// 2. Hard read-only layer — the engine physically rejects any write.
const db = new Database(path, { readonly: true });
```

A failed `new Database(...)` (corrupt/non-SQLite file) is translated to an AxiError, never a raw
throw. `node:sqlite` is intentionally avoided for v1 (Stability 1.2 release-candidate; raises the
engine floor above the Node 18-era baseline).

## Architecture

```
src/bin/sqlite-axi.ts   runAxiCli config + dispatch
src/db.ts               THE boundary: open read-only, run metadata + queries (only impure file)
src/discover.ts         find *.db/*.sqlite/*.sqlite3 in cwd + one level down (pure)
src/resolve.ts          choose db source: --db > leading file-like positional > auto-discover
src/validate.ts         read-only statement allowlist (pure)
src/format.ts           cell truncation, null/blob rendering, value coercion (pure)
src/commands/{tables,schema,sample,query}.ts   pure transforms returning plain objects
src/home.ts             no-args schema snapshot
src/help.ts             top-level + per-command help
test/                   vitest against real temp SQLite files seeded per test
.agents/skills/sqlite-axi/SKILL.md
README.md, package.json, tsconfig.json, vitest.config.ts, .github/workflows/ci.yml
```

`db.ts` is the only impure module (touches better-sqlite3 and the filesystem). Commands are pure
transforms given a db handle and parsed args. Tests seed real temporary SQLite files — more honest
than mocking the driver.

## Database selection

**Auto-discover + override.** Resolution order (`src/resolve.ts`):

1. `--db <path>` flag — always wins.
2. A leading positional treated as the database **only if** it ends in `.db`/`.sqlite`/`.sqlite3`
   **or** resolves to an existing file; otherwise it is the command's own argument.
3. Otherwise auto-discover: scan CWD and one level down for `*.db`/`*.sqlite`/`*.sqlite3`,
   **skipping** `.git`, `node_modules`, `dist`, `.next`, `coverage`.

Discovery outcomes:

- **Exactly one** → use it.
- **None** → `NO_DATABASE` AxiError (exit 1) suggesting an explicit path.
- **Multiple, none chosen** → the home view lists candidates; commands that must act throw
  `DB_AMBIGUOUS` (exit 2) listing the paths.

`[db]` resolution examples: `sqlite-axi schema users` → table `users`, db auto-discovered;
`sqlite-axi schema app.db users` → db `app.db`, table `users`.

## Commands

### Home (no args)

```
database: ./app.db
tables: 7 (4210 rows total)
largest[5]{table,rows}:
  events,3800
  users,210
objects: 2 views, 1 triggers
help[2]:
  Run `sqlite-axi schema <table-or-view>` for columns, keys, and indexes
  Run `sqlite-axi query "select ..."` to run a read-only query
```

### `tables [db]`

List tables with row and column counts plus the total count.

```
database: ./app.db
count: 7 tables
tables[7]{table,rows,columns}:
  users,210,6
  events,3800,5
help[1]: Run `sqlite-axi schema <table-or-view>` for details
```

### `schema [db] <table-or-view>`

Detail view via `PRAGMA table_info` / `index_list` / `foreign_key_list`. The object name is required;
omitting it → `VALIDATION_ERROR` (exit 2) suggesting `sqlite-axi tables` to list tables first.

```
table: users
rows: 210
columns[6]{name,type,pk,notnull,default}:
  id,INTEGER,1,1,
  email,TEXT,0,1,
  created_at,TEXT,0,1,CURRENT_TIMESTAMP
indexes[2]{name,unique,columns}:
  idx_users_created,0,created_at
foreignKeys[1]{column,references}:
  team_id,teams.id
```

### `sample [db] <table-or-view> [--limit 10] [--full]`

Quick capped peek (`SELECT * FROM <table-or-view> LIMIT n`, object name validated against the schema).

```
table: users
count: 5 of 210 rows
rows[5]{id,email,name,created_at}:
  1,alice@example.com,Alice,2024-01-02
```

### `query [db] "<sql>" [--limit 50] [--full]`

Run a read-only query. Because an exact total is not cheap for arbitrary SQL, fetch up to
`--limit`+1 rows and report `complete` or `capped`:

```
database: ./app.db
rows: 12 (complete)
result[12]{id,email}:
  1,alice@example.com
```

`--full` disables per-cell truncation; the row count stays capped.

## Read-only enforcement

1. **Hard layer:** `new Database(path, { readonly: true })` — the engine rejects every write.
2. **Allowlist (`src/validate.ts`):** after stripping leading comments and confirming a **single**
   statement (a `;` followed by more content is rejected), the SQL must match exactly one of three
   shapes (case-insensitive):
   - `SELECT ...`
   - `EXPLAIN SELECT ...`
   - `EXPLAIN QUERY PLAN SELECT ...`

   Arbitrary `EXPLAIN <anything>` is **not** allowed — `EXPLAIN UPDATE ...` likely wouldn't mutate,
   but it weakens the mental model, so v1 stays boring. DDL/DML, `ATTACH`/`DETACH`, `PRAGMA`, and
   `WITH` are all rejected. Internal schema commands call `db.pragma()` / table-valued pragma
   functions directly, bypassing this validator.

`WITH` is **excluded in v1** (SQLite CTEs can feed writes; robust validation is deferred to v2).
A rejected statement → `error: only read-only queries are allowed (SELECT, EXPLAIN SELECT,
EXPLAIN QUERY PLAN SELECT)`, code `READ_ONLY`, exit 2.

## Identifier safety (table commands)

`sample` and the `schema` PRAGMAs must **never** interpolate a user-supplied object name into SQL
as raw text. The flow:

1. **Exact schema match first** — resolve the requested name against known tables/views
   (`sqlite_master`); no match → `NOT_FOUND` (exit 1) suggesting `tables`.
2. **Schema introspection** uses the table-valued pragma functions
   (`pragma_table_info(?)`, `pragma_index_list(?)`, `pragma_foreign_key_list(?)`) with the name
   passed as a **bound parameter** — no string interpolation at all.
3. **`sample`** needs `SELECT * FROM <table-or-view>`, and SQLite cannot bind an identifier, so the name —
   already proven to exist by step 1 — is emitted as a **quoted identifier** (`"` with internal
   `"` doubled). The row limit is a bound `?` parameter.

## Formatting (P3)

- Cells longer than 200 chars truncate with ` …` (disabled by `sample --full` / `query --full`).
- `BLOB` → `<blob N bytes>`; `NULL` → empty cell; numbers/reals rendered as-is.
- Output is TOON only — no `--json` (the SDK does not provide it for free).

**Column names (P1 robustness).** `query` result columns come from arbitrary SQL — names and
aliases may contain spaces, commas, or quotes, which would corrupt a tabular TOON header like
`result[2]{weird,column,name}:`. Rule: if **every** result column name is a safe TOON field
identifier (`/^[A-Za-z_][A-Za-z0-9_]*$/`), emit the compact tabular form; if **any** name is
unsafe, fall back to a row-object array (each row encoded as an object, which TOON quotes
per-key). The exact escaping/fallback is verified against `@toon-format/toon` behavior during
implementation. Tests cover weird column names and aliases (`select 1 as "a,b"`, spaces, quotes).

## Errors (P6)

| Situation | Code | Exit |
| --- | --- | --- |
| No database discovered | `NO_DATABASE` | 1 |
| Multiple discovered, none chosen | `DB_AMBIGUOUS` | 2 |
| Path is not a file / not valid SQLite | `NOT_FOUND` / `INVALID_DB` | 1 |
| Unknown table/view (schema/sample) | `NOT_FOUND` | 1 |
| Non-read-only or multi-statement SQL | `READ_ONLY` | 2 |
| SQL syntax / execution error | `QUERY_ERROR` | 1 |

Errors are structured TOON on stdout with an actionable `help` line. Raw better-sqlite3 stack
traces never leak; SQL syntax messages (the agent's own input) are surfaced concisely.

## Ambient context (P7)

`sqlite-axi setup hooks` installs `SessionStart` hooks (Claude Code, Codex, OpenCode) that print
the schema snapshot. A generated `SKILL.md` is the on-demand secondary path
(`npx skills add SSBrouhard/sqlite-axi`).

## Testing

TDD with vitest against **real temporary SQLite files** seeded per test (better-sqlite3 creates
them in a writable temp dir; the tool still opens targets read-only). Cover:

- Discovery: single / none / multiple, junk-dir skipping; `[db]` vs table resolution.
- Read-only validator: accept `SELECT`, `EXPLAIN SELECT`, `EXPLAIN QUERY PLAN SELECT`; reject
  `EXPLAIN UPDATE`, DML/DDL, `PRAGMA`, `WITH`, stacked statements, `ATTACH`.
- Identifier safety: unknown table/view → `NOT_FOUND`; a table named with quotes/spaces is sampled
  correctly via the quoted identifier; schema introspection binds the name as a parameter.
- Column-name handling: `select 1 as "a,b"` and names with spaces/quotes fall back to row-object
  form and still encode to valid TOON.
- Output shapes per command, cell truncation, blob/null rendering, query capping, error mapping.

## Package & submission

- `engines.node: ">=20"` (better-sqlite3 floor). `files`: `dist`, `README.md`, `LICENSE`.
- Runtime deps: `axi-sdk-js`, `better-sqlite3`. MIT license, author SSBrouhard.
- Repo `github.com/SSBrouhard/sqlite-axi`; PR adds one row to the AXI Community catalog.
