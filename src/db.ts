import { statSync } from "node:fs";
import { AxiError } from "axi-sdk-js";
import Database from "better-sqlite3";

export type DB = Database.Database;

/** Existence guard for clean NOT_FOUND, then a hard read-only handle. */
export function openDb(path: string): DB {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) {
    throw new AxiError(`database file not found: ${path}`, "NOT_FOUND", [
      "Run `sqlite-axi` with no arguments to auto-discover a database",
    ]);
  }
  let db: Database.Database | undefined;
  try {
    db = new Database(path, { readonly: true });
    // better-sqlite3 opens lazily; force a header read so a non-SQLite file fails here.
    db.prepare("SELECT name FROM sqlite_master LIMIT 1").get();
  } catch {
    try { db?.close(); } catch { /* ignore close error */ }
    throw new AxiError(`not a valid SQLite database: ${path}`, "INVALID_DB", [
      "Confirm the file is a SQLite database",
    ]);
  }
  return db;
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function tableNames(db: DB): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((r) => (r as { name: string }).name);
}

export function tableExists(db: DB, name: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?")
      .get(name) !== undefined
  );
}

export function rowCount(db: DB, name: string): number {
  return (db.prepare(`SELECT count(*) AS n FROM ${quoteIdent(name)}`).get() as { n: number }).n;
}

export interface ColumnInfo {
  name: string;
  type: string;
  pk: number;
  notnull: number;
  default: string;
}

export function columns(db: DB, name: string): ColumnInfo[] {
  const rows = db
    .prepare('SELECT name, type, pk, "notnull" AS nn, dflt_value FROM pragma_table_info(?)')
    .all(name) as Array<{
    name: string;
    type: string;
    pk: number;
    nn: number;
    dflt_value: string | null;
  }>;
  return rows.map((r) => ({
    name: r.name,
    type: r.type,
    pk: r.pk,
    notnull: r.nn,
    default: r.dflt_value ?? "",
  }));
}

export interface IndexInfo {
  name: string;
  unique: number;
  columns: string;
}

export function indexes(db: DB, name: string): IndexInfo[] {
  const list = db
    .prepare('SELECT name, "unique" AS uniq FROM pragma_index_list(?)')
    .all(name) as Array<{ name: string; uniq: number }>;
  return list.map((idx) => ({
    name: idx.name,
    unique: idx.uniq,
    columns: db
      .prepare("SELECT name FROM pragma_index_info(?)")
      .all(idx.name)
      .map((c) => (c as { name: string }).name)
      .join(" "),
  }));
}

export interface ForeignKey {
  column: string;
  references: string;
}

export function foreignKeys(db: DB, name: string): ForeignKey[] {
  const rows = db
    .prepare('SELECT "table" AS tbl, "from" AS col, "to" AS ref FROM pragma_foreign_key_list(?)')
    .all(name) as Array<{ tbl: string; col: string; ref: string }>;
  return rows.map((r) => ({ column: r.col, references: `${r.tbl}.${r.ref}` }));
}

export interface ObjectCounts {
  tables: number;
  views: number;
  triggers: number;
}

export function objectCounts(db: DB): ObjectCounts {
  const count = (type: string) =>
    (
      db
        .prepare(
          "SELECT count(*) AS n FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%'",
        )
        .get(type) as { n: number }
    ).n;
  return { tables: count("table"), views: count("view"), triggers: count("trigger") };
}

export interface QueryResult {
  columnNames: string[];
  rows: unknown[][];
  capped: boolean;
}

export function runQuery(db: DB, sql: string, limit: number): QueryResult {
  let stmt: Database.Statement;
  try {
    stmt = db.prepare(sql);
  } catch (error) {
    throw queryError(error);
  }
  const columnNames = stmt.columns().map((c) => c.name);
  const rows: unknown[][] = [];
  let capped = false;
  try {
    for (const row of stmt.raw().iterate()) {
      if (rows.length >= limit) {
        capped = true;
        break;
      }
      rows.push(row as unknown[]);
    }
  } catch (error) {
    throw queryError(error);
  }
  return { columnNames, rows, capped };
}

export function sample(db: DB, name: string, limit: number): QueryResult {
  const stmt = db.prepare(`SELECT * FROM ${quoteIdent(name)} LIMIT ?`);
  const columnNames = stmt.columns().map((c) => c.name);
  const rows = stmt.raw().all(limit) as unknown[][];
  return { columnNames, rows, capped: false };
}

function queryError(error: unknown): AxiError {
  const message = error instanceof Error ? error.message : String(error);
  return new AxiError(`query failed: ${message}`, "QUERY_ERROR", [
    "Check the SQL syntax and table/column names",
  ]);
}
