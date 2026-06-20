import { AxiError } from "axi-sdk-js";
import { parseFlags, parseLimit } from "../args.js";
import { openDb, rowCount, sample, tableExists } from "../db.js";
import { buildRows } from "../format.js";
import { resolveDb } from "../resolve.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 1000;

export function sampleCommand(args: string[]): Record<string, unknown> {
  const { positionals, flags } = parseFlags(args, ["full"]);
  const { dbPath, rest } = resolveDb(positionals, flags);
  const table = rest[0];
  if (!table) {
    throw new AxiError("a table or view name is required", "VALIDATION_ERROR", [
      "sqlite-axi sample <table-or-view> [--limit 10]",
    ]);
  }
  if (rest.length > 1) {
    throw new AxiError("sample accepts exactly one table or view name", "VALIDATION_ERROR", [
      "Run `sqlite-axi sample [db] <table-or-view> [--limit 10]`",
    ]);
  }
  const limit = parseLimit(flags.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const full = flags.full === true;
  const db = openDb(dbPath);
  try {
    if (!tableExists(db, table)) {
      throw new AxiError(`table or view "${table}" not found`, "NOT_FOUND", [
        "Run `sqlite-axi tables` to list available tables",
      ]);
    }
    const total = rowCount(db, table);
    const result = sample(db, table, limit);
    return {
      table,
      count: `${result.rows.length} of ${total} rows`,
      ...buildRows(result.columnNames, result.rows, full),
    };
  } finally {
    db.close();
  }
}
