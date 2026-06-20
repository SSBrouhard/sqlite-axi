<h1 align="center">sqlite-axi</h1>

<p align="center">Inspect and query SQLite databases read-only, with token-efficient output — an <a href="https://github.com/kunchenguid/axi">AXI</a>.</p>

---

`sqlite-axi` wraps SQLite in an agent-ergonomic CLI. It auto-discovers a database in the
current directory or one level down and returns [TOON](https://toonformat.dev/) — compact schema snapshots and
capped query results instead of walls of JSON. Read-only by construction.

## Install

```sh
npm install -g sqlite-axi
```

Or run without installing:

```sh
npx -y sqlite-axi <command>
```

## Usage

```sh
$ sqlite-axi                      # auto-discovered snapshot
database: ./app.db
tables: 3 (6 rows total)
largest[3]{table,rows}:
  users,5
  teams,1
  memberships,0
objects: 1 views, 0 triggers

$ sqlite-axi schema users
table: users
rows: 5
columns[4]{name,type,pk,notnull,default}:
  id,INTEGER,1,1,
  email,TEXT,0,1,

$ sqlite-axi query "select id, email from users limit 2"
database: ./app.db
rows: 2 (complete)
result[2]{id,email}:
  1,u1@example.com
  2,u2@example.com
```

`tables [db]` lists base tables. `schema [db] <table-or-view>` and
`sample [db] <table-or-view>` inspect one object. `query [db] "<sql>"` runs a single read-only
statement. A database can also be selected with `--db <path>`. `--limit` accepts decimal integers
and caps rows at 1000;
`--full` disables 200-character cell truncation for `sample` and `query`.

## Read-only guarantee

Two independent layers: the database is opened with SQLite's read-only flag (the engine rejects
every write), and a validator accepts only `SELECT`, `EXPLAIN SELECT`, and `EXPLAIN QUERY PLAN
SELECT`. Writes, `PRAGMA`, `WITH`, and stacked statements are refused with a structured error.

## Agent integration

```sh
sqlite-axi setup hooks                         # ambient SessionStart snapshot
npx skills add SSBrouhard/sqlite-axi --skill sqlite-axi
```

## Development

```sh
npm install
npm test          # vitest against real temp SQLite files
npm run build
npm run dev -- tables app.db
```

## License

[MIT](LICENSE)
