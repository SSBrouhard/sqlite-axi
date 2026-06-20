import { describe, expect, it } from "vitest";
import { sampleCommand } from "../src/commands/sample.js";
import { seedDb, seedWeirdDb } from "./helpers.js";

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
    try {
      sampleCommand([seedDb(), "users", "extra"]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("VALIDATION_ERROR");
    }
  });

  it("errors NOT_FOUND for an unknown table", () => {
    try {
      sampleCommand([seedDb(), "ghost"]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("NOT_FOUND");
    }
  });
});
