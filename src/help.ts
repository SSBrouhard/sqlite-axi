export const TOP_LEVEL_HELP = `sqlite-axi — inspect and query SQLite databases (read-only)

Usage: sqlite-axi <command> [db] [args] [flags]

Commands:
  tables [db]                    List tables with row and column counts
  schema [db] <table-or-view>    Columns, indexes, foreign keys, row count
  sample [db] <table-or-view> [--limit]  Preview rows (default 10)
  query  [db] "<sql>" [--limit]  Run a read-only SELECT (default 50 rows)
  setup hooks                    Install agent session-start hooks

The database is auto-discovered in the current directory, or given as a
file-like positional or with --db <path>. Run with no arguments for a
schema snapshot. Run \`sqlite-axi <command> --help\` for details.
`;

export const COMMAND_HELP: Record<string, string> = {
  tables: `sqlite-axi tables [db]

List base tables with row counts and column counts.

Examples:
  sqlite-axi tables
  sqlite-axi tables app.db
`,
  schema: `sqlite-axi schema [db] <table-or-view>

Show a table or view's columns (type, pk, notnull, default), indexes, and foreign keys.

Examples:
  sqlite-axi schema users
  sqlite-axi schema app.db users
`,
  sample: `sqlite-axi sample [db] <table-or-view> [--limit 10] [--full]

Preview rows from a table or view. Cells over 200 chars truncate unless --full is given.

Flags:
  --limit <n>   Decimal rows to show (default 10, max 1000)
  --full        Do not truncate cell values

Examples:
  sqlite-axi sample users
  sqlite-axi sample users --limit 25
`,
  query: `sqlite-axi query [db] "<sql>" [--limit 50] [--full]

Run a single read-only query: SELECT, WITH ... SELECT, EXPLAIN SELECT, or EXPLAIN QUERY PLAN SELECT.
Writes, PRAGMA, write CTEs (WITH ... INSERT/UPDATE/DELETE), and stacked statements are rejected.

Flags:
  --limit <n>   Decimal max rows returned (default 50, max 1000)
  --full        Do not truncate cell values

Examples:
  sqlite-axi query "select id, email from users where name like 'A%'"
  sqlite-axi query "explain query plan select * from users"
`,
  setup: `sqlite-axi setup hooks

Install or repair session-start hooks so agents see the schema snapshot at the
start of each session (Claude Code, Codex, OpenCode). Idempotent.

Examples:
  sqlite-axi setup hooks
`,
};
