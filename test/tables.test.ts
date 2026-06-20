import { describe, expect, it } from "vitest";
import { tablesCommand } from "../src/commands/tables.js";
import { seedDb } from "./helpers.js";

describe("tables", () => {
  it("lists tables with row and column counts", () => {
    const out = tablesCommand([seedDb()]);
    expect(out.count).toBe("3 tables");
    expect(out.tables).toContainEqual({ table: "users", rows: 5, columns: 4 });
    expect(out.help).toEqual(["Run `sqlite-axi schema <table>` for details"]);
  });
});
