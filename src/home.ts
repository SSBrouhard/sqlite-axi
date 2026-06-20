import { isAbsolute, join } from "node:path";
import { discoverDatabases } from "./discover.js";
import { objectCounts, openDb, rowCount, tableNames } from "./db.js";

const HELP = [
  "Run `sqlite-axi tables` to list tables with row counts",
  "Run `sqlite-axi schema <table>` for columns, keys, and indexes",
  "Run `sqlite-axi sample <table>` to preview rows",
  'Run `sqlite-axi query "select ..."` to run a read-only query',
];

export function homeCommand(
  _args: string[] = [],
  _context?: unknown,
  cwd: string = process.cwd(),
): Record<string, unknown> {
  const found = discoverDatabases(cwd);
  if (found.length === 0) {
    return { databases: "no SQLite database found in the current directory", help: HELP };
  }
  if (found.length > 1) {
    return {
      databases: found,
      help: ["Pick one with --db, e.g. `sqlite-axi tables --db <path>`"],
    };
  }

  const dbPath = found[0];
  const absPath = isAbsolute(dbPath) ? dbPath : join(cwd, dbPath);
  const db = openDb(absPath);
  try {
    const names = tableNames(db);
    const counts = names.map((name) => ({ table: name, rows: rowCount(db, name) }));
    const totalRows = counts.reduce((sum, t) => sum + t.rows, 0);
    const largest = [...counts].sort((a, b) => b.rows - a.rows).slice(0, 5);
    const oc = objectCounts(db);
    return {
      database: dbPath,
      tables: `${names.length} (${totalRows} rows total)`,
      largest,
      objects: `${oc.views} views, ${oc.triggers} triggers`,
      help: [HELP[1], HELP[3]],
    };
  } finally {
    db.close();
  }
}
