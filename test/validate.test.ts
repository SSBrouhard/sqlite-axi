import { describe, expect, it } from "vitest";
import { validateReadOnly } from "../src/validate.js";

describe("validateReadOnly", () => {
  it("accepts SELECT, EXPLAIN SELECT, EXPLAIN QUERY PLAN SELECT", () => {
    expect(() => validateReadOnly("select * from users")).not.toThrow();
    expect(() => validateReadOnly("  -- c\n SELECT 1")).not.toThrow();
    expect(() => validateReadOnly("EXPLAIN SELECT 1")).not.toThrow();
    expect(() => validateReadOnly("explain query plan select 1")).not.toThrow();
  });

  it("rejects writes, PRAGMA, WITH, EXPLAIN UPDATE, and stacked statements", () => {
    for (const sql of [
      "update users set name='x'",
      "delete from users",
      "drop table users",
      "pragma table_info(users)",
      "with t as (select 1) select * from t",
      "explain update users set name='x'",
      "select 1; drop table users",
      "attach database 'x.db' as y",
      "",
    ]) {
      expect(() => validateReadOnly(sql), sql).toThrow();
    }
  });

  it("throws READ_ONLY for non-read statements", () => {
    expect(() => validateReadOnly("delete from users")).toMatchObject;
    try {
      validateReadOnly("delete from users");
    } catch (e) {
      expect((e as { code: string }).code).toBe("READ_ONLY");
    }
  });
});
