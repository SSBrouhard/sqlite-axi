import { describe, expect, it } from "vitest";
import { sampleCommand } from "../src/commands/sample.js";
import { expectAxiError, seedDb, seedWeirdDb } from "./helpers.js";

describe("sample", () => {
  it("returns capped rows with a total count", () => {
    const out = sampleCommand([seedDb(), "users", "--limit", "2"]);
    expect(out.count).toBe("2 of 5 rows");
    expect((out.rows as unknown[]).length).toBe(2);
  });

  it("falls back to a columns map for unsafe column names", () => {
    const out = sampleCommand([seedWeirdDb(), "odd name"]);
    expect(out.columns).toEqual([{ index: 0, name: "a,b" }, { index: 1, name: "normal" }]);
    expect(out.rows).toEqual([{ c0: "hello", c1: 1 }]);
  });

  it("rejects extra positional arguments", () => {
    expectAxiError(() => sampleCommand([seedDb(), "users", "extra"]), "VALIDATION_ERROR");
  });

  it("errors NOT_FOUND for an unknown table", () => {
    expectAxiError(() => sampleCommand([seedDb(), "ghost"]), "NOT_FOUND");
  });
});
