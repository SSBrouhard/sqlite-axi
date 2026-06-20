import { describe, expect, it } from "vitest";
import { queryCommand } from "../src/commands/query.js";
import { seedDb } from "./helpers.js";

describe("query", () => {
  it("runs a SELECT and reports complete vs capped", () => {
    const db = seedDb();
    const complete = queryCommand([db, "select id, email from users"]);
    expect(complete.rows).toBe("5 (complete)");
    expect((complete.result as unknown[]).length).toBe(5);

    const capped = queryCommand([db, "select id from users", "--limit", "2"]);
    expect(capped.rows).toBe("2 (capped, more rows available)");
  });

  it("rejects a write query before touching the database", () => {
    try {
      queryCommand([seedDb(), "delete from users"]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("READ_ONLY");
    }
  });

  it("handles aliases with unsafe names via the columns fallback", () => {
    const out = queryCommand([seedDb(), 'select id as "a,b" from users limit 1']);
    expect((out.columns as Array<{ name: string }>)[0].name).toBe("a,b");
    expect((out.result as Array<Record<string, unknown>>)[0]).toHaveProperty("c0");
  });

  it("maps a SQL syntax error to QUERY_ERROR", () => {
    try {
      queryCommand([seedDb(), "select * from nope_table"]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("QUERY_ERROR");
    }
  });
});
