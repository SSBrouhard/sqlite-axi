import { describe, expect, it } from "vitest";
import { schemaCommand } from "../src/commands/schema.js";
import { expectAxiError, seedDb } from "./helpers.js";

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

  it("requires a table or view name (VALIDATION_ERROR)", () => {
    expectAxiError(() => schemaCommand([seedDb()]), "VALIDATION_ERROR");
  });

  it("rejects extra positional arguments", () => {
    expectAxiError(() => schemaCommand([seedDb(), "users", "extra"]), "VALIDATION_ERROR");
  });

  it("errors NOT_FOUND for an unknown table", () => {
    expectAxiError(() => schemaCommand([seedDb(), "ghost"]), "NOT_FOUND");
  });
});
