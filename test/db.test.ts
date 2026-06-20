import { describe, expect, it } from "vitest";
import {
  columns, foreignKeys, indexes, objectCounts, openDb, quoteIdent,
  rowCount, runQuery, sample, tableExists, tableNames,
} from "../src/db.js";
import { seedDb, seedWeirdDb } from "./helpers.js";

describe("db boundary", () => {
  it("opens read-only and rejects writes at the engine level", () => {
    const db = openDb(seedDb());
    expect(() => db.exec("INSERT INTO users (email) VALUES ('z@z.com')")).toThrow();
    db.close();
  });

  it("throws NOT_FOUND for a missing file", () => {
    try {
      openDb("/tmp/nope-" + Date.now() + ".db");
    } catch (e) {
      expect((e as { code: string }).code).toBe("NOT_FOUND");
    }
  });

  it("lists base tables and reports existence", () => {
    const db = openDb(seedDb());
    expect(tableNames(db)).toEqual(["memberships", "teams", "users"]);
    expect(tableExists(db, "users")).toBe(true);
    expect(tableExists(db, "active_users")).toBe(true); // view
    expect(tableExists(db, "ghost")).toBe(false);
    db.close();
  });

  it("returns columns, indexes, foreign keys, counts", () => {
    const db = openDb(seedDb());
    const cols = columns(db, "users");
    expect(cols[0]).toEqual({ name: "id", type: "INTEGER", pk: 1, notnull: 1, default: "" });
    expect(rowCount(db, "users")).toBe(5);
    expect(indexes(db, "users").some((i) => i.name === "idx_users_created")).toBe(true);
    expect(foreignKeys(db, "memberships")).toContainEqual({ column: "team_id", references: "teams.id" });
    expect(objectCounts(db)).toEqual({ tables: 3, views: 1, triggers: 0 });
    db.close();
  });

  it("samples a table with an awkward name via a quoted identifier", () => {
    const db = openDb(seedWeirdDb());
    const r = sample(db, "odd name", 10);
    expect(r.columnNames).toEqual(["a,b", "normal"]);
    expect(r.rows).toEqual([["hello", 1]]);
    db.close();
  });

  it("caps query rows at the limit and flags more available", () => {
    const db = openDb(seedDb());
    const r = runQuery(db, "select id from users", 3);
    expect(r.rows.length).toBe(3);
    expect(r.capped).toBe(true);
    db.close();
  });

  it("quotes identifiers safely", () => {
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });
});
