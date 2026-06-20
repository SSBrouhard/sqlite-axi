import { parseFlags } from "../args.js";
import { AxiError } from "axi-sdk-js";
import { columns, openDb, rowCount, tableNames } from "../db.js";
import { resolveDb } from "../resolve.js";

export function tablesCommand(args: string[]): Record<string, unknown> {
  const { positionals, flags } = parseFlags(args);
  const { dbPath, rest } = resolveDb(positionals, flags);
  if (rest.length > 0) {
    throw new AxiError("tables does not accept table arguments", "VALIDATION_ERROR", [
      "Run `sqlite-axi tables [db]`",
      "Run `sqlite-axi schema <table>` for one table",
    ]);
  }
  const db = openDb(dbPath);
  try {
    const names = tableNames(db);
    if (names.length === 0) {
      return { database: dbPath, tables: "0 tables in this database" };
    }
    const tables = names.map((name) => ({
      table: name,
      rows: rowCount(db, name),
      columns: columns(db, name).length,
    }));
    return {
      database: dbPath,
      count: `${tables.length} tables`,
      tables,
      help: ["Run `sqlite-axi schema <table>` for details"],
    };
  } finally {
    db.close();
  }
}
