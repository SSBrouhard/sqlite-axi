import { describe, expect, it } from "vitest";
import { validateReadOnly } from "../src/validate.js";

describe("validateReadOnly", () => {
  it("accepts SELECT, EXPLAIN SELECT, EXPLAIN QUERY PLAN SELECT", () => {
    expect(() => validateReadOnly("select * from users")).not.toThrow();
    expect(() => validateReadOnly("  -- c\n SELECT 1")).not.toThrow();
    expect(() => validateReadOnly("select ';' as semi")).not.toThrow();
    expect(() => validateReadOnly("select '/* not a comment */' as body")).not.toThrow();
    expect(() => validateReadOnly("select 1; -- trailing comment")).not.toThrow();
    expect(() => validateReadOnly("EXPLAIN SELECT 1")).not.toThrow();
    expect(() => validateReadOnly("explain query plan select 1")).not.toThrow();
  });

  it("accepts a single read-only CTE SELECT, including EXPLAIN forms", () => {
    expect(() =>
      validateReadOnly("with x as (select 1 as n) select n from x"),
    ).not.toThrow();
    expect(() =>
      validateReadOnly("WITH x AS (SELECT 1), y AS (SELECT 2) SELECT * FROM x"),
    ).not.toThrow();
    expect(() =>
      validateReadOnly(
        "with recursive t(n) as (select 1 union all select n+1 from t where n<3) select n from t",
      ),
    ).not.toThrow();
    expect(() =>
      validateReadOnly("WITH x AS (WITH y AS (SELECT 1) SELECT * FROM y) SELECT * FROM x"),
    ).not.toThrow();
    expect(() =>
      validateReadOnly("EXPLAIN WITH x AS (SELECT 1) SELECT * FROM x"),
    ).not.toThrow();
    expect(() =>
      validateReadOnly("explain query plan with x as (select 1) select * from x"),
    ).not.toThrow();
    expect(() =>
      validateReadOnly("  -- c\n WITH x AS (SELECT 1) SELECT * FROM x"),
    ).not.toThrow();
  });

  it("rejects writes, PRAGMA, EXPLAIN UPDATE, stacked statements, and write CTEs", () => {
    for (const sql of [
      "update users set name='x'",
      "delete from users",
      "drop table users",
      "pragma table_info(users)",
      "explain update users set name='x'",
      "select 1; drop table users",
      "attach database 'x.db' as y",
      "with x as (select 1) insert into users (email) select 'z@z.com'",
      "with x as (select 1) update users set name='x'",
      "with x as (select 1) delete from users",
      "with x as (select 1) replace into users (email) values ('z@z.com')",
      "with x as (insert into users (email) values ('z@z.com')) select 1",
      "with x as (select 1) pragma table_info(users)",
      "with x as (select 1) select 1; drop table users",
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
