import { describe, expect, it } from "vitest";
import { schemaCommand } from "../src/commands/schema.js";
import { seedDb } from "./helpers.js";

describe("schema", () => {
  it("returns columns, indexes, foreign keys, and row count", () => {
    const db = seedDb();
    const out = schemaCommand([db, "users"]);
    expect(out.table).toBe("users");
    expect(out.rows).toBe(5);
    expect((out.columns as unknown[]).length).toBe(4);
    expect(out.indexes).toBeDefined();
  });

  it("omits empty index/fk sections", () => {
    const out = schemaCommand([seedDb(), "teams"]);
    expect(out.indexes).toBeUndefined();
    expect(out.foreignKeys).toBeUndefined();
  });

  it("requires a table name (VALIDATION_ERROR)", () => {
    expect(() => schemaCommand([seedDb()])).toThrowError();
    try {
      schemaCommand([seedDb()]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("VALIDATION_ERROR");
    }
  });

  it("errors NOT_FOUND for an unknown table", () => {
    try {
      schemaCommand([seedDb(), "ghost"]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("NOT_FOUND");
    }
  });
});
