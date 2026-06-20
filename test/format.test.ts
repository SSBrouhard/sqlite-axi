import { describe, expect, it } from "vitest";
import { buildRows, isSafeFieldName, renderCell } from "../src/format.js";

describe("renderCell", () => {
  it("renders nulls, numbers, blobs, and truncates long strings", () => {
    expect(renderCell(null)).toBe("");
    expect(renderCell(42)).toBe(42);
    expect(renderCell(new Uint8Array([1, 2, 3]))).toBe("<blob 3 bytes>");
    const long = "x".repeat(250);
    expect(String(renderCell(long))).toHaveLength(202); // 200 + " …"
    expect(renderCell(long, true)).toBe(long); // --full disables truncation
  });
});

describe("isSafeFieldName", () => {
  it("accepts identifiers, rejects names with spaces/commas/quotes", () => {
    expect(isSafeFieldName("user_id")).toBe(true);
    expect(isSafeFieldName("a,b")).toBe(false);
    expect(isSafeFieldName("has space")).toBe(false);
    expect(isSafeFieldName("1col")).toBe(false);
  });
});

describe("buildRows", () => {
  it("uses real keys when all column names are safe and unique", () => {
    const out = buildRows(["id", "email"], [[1, "a@b.com"]], false);
    expect(out).toEqual({ rows: [{ id: 1, email: "a@b.com" }] });
  });

  it("falls back to a columns map + c0..cN keys when names are unsafe", () => {
    const out = buildRows(["a,b", "id"], [["x", 7]], false, "result");
    expect(out).toEqual({
      columns: [{ index: 0, name: "a,b" }, { index: 1, name: "id" }],
      result: [{ c0: "x", c1: 7 }],
    });
  });

  it("falls back when column names are duplicated", () => {
    const out = buildRows(["id", "id"], [[1, 2]], false);
    expect(out.columns).toEqual([{ index: 0, name: "id" }, { index: 1, name: "id" }]);
  });
});
