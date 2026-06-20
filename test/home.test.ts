import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { homeCommand } from "../src/home.js";
import { seedDb } from "./helpers.js";

describe("home", () => {
  it("shows a schema snapshot for a single discovered database", () => {
    const cwd = dirname(seedDb());
    const out = homeCommand([], undefined, cwd);
    expect(out.database).toBe("app.db");
    expect(out.tables).toBe("3 (6 rows total)");
    expect(out.objects).toBe("1 views, 0 triggers");
    expect((out.largest as Array<{ table: string }>)[0].table).toBe("users");
  });

  it("shows help only when no database is found", () => {
    const out = homeCommand([], undefined, "/tmp/empty-" + Date.now());
    expect(out.database).toBeUndefined();
    expect((out.help as string[]).length).toBeGreaterThan(0);
  });
});
