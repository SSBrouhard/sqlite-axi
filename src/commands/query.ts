import { parseFlags, parseLimit } from "../args.js";
import { openDb, runQuery } from "../db.js";
import { buildRows } from "../format.js";
import { resolveDb } from "../resolve.js";
import { validateReadOnly } from "../validate.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

export function queryCommand(args: string[]): Record<string, unknown> {
  const { positionals, flags } = parseFlags(args, ["full"]);
  const { dbPath, rest } = resolveDb(positionals, flags);
  const sql = rest.join(" ").trim();
  validateReadOnly(sql); // throws on empty / non-read-only
  const limit = parseLimit(flags.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const full = flags.full === true;
  const db = openDb(dbPath);
  try {
    const result = runQuery(db, sql, limit);
    const status = result.capped
      ? `${result.rows.length} (capped, more rows available)`
      : `${result.rows.length} (complete)`;
    return {
      database: dbPath,
      rows: status,
      ...buildRows(result.columnNames, result.rows, full, "result"),
    };
  } finally {
    db.close();
  }
}
