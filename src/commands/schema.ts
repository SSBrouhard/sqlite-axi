import { AxiError } from "axi-sdk-js";
import { parseFlags } from "../args.js";
import { columns, foreignKeys, indexes, openDb, rowCount, tableExists } from "../db.js";
import { resolveDb } from "../resolve.js";

export function schemaCommand(args: string[]): Record<string, unknown> {
  const { positionals, flags } = parseFlags(args);
  const { dbPath, rest } = resolveDb(positionals, flags);
  const table = rest[0];
  if (!table) {
    throw new AxiError("a table or view name is required", "VALIDATION_ERROR", [
      "Run `sqlite-axi tables` to list tables, then `sqlite-axi schema <table-or-view>`",
    ]);
  }
  if (rest.length > 1) {
    throw new AxiError("schema accepts exactly one table or view name", "VALIDATION_ERROR", [
      "Run `sqlite-axi schema [db] <table-or-view>`",
    ]);
  }
  const db = openDb(dbPath);
  try {
    if (!tableExists(db, table)) {
      throw new AxiError(`table or view "${table}" not found`, "NOT_FOUND", [
        "Run `sqlite-axi tables` to list available tables",
      ]);
    }
    const out: Record<string, unknown> = {
      table,
      rows: rowCount(db, table),
      columns: columns(db, table),
    };
    const idx = indexes(db, table);
    if (idx.length > 0) out.indexes = idx;
    const fks = foreignKeys(db, table);
    if (fks.length > 0) out.foreignKeys = fks;
    return out;
  } finally {
    db.close();
  }
}
