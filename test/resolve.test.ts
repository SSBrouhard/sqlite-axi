import { describe, expect, it } from "vitest";
import { resolveDb } from "../src/resolve.js";
import { seedDb } from "./helpers.js";

describe("resolveDb", () => {
  it("prefers --db and leaves all positionals as command args", () => {
    const r = resolveDb(["users"], { db: "x.db" });
    expect(r).toEqual({ dbPath: "x.db", rest: ["users"] });
  });

  it("treats a file-like leading positional as the db", () => {
    const r = resolveDb(["app.db", "users"], {});
    expect(r).toEqual({ dbPath: "app.db", rest: ["users"] });
  });

  it("treats a non-file-like leading positional as a command arg and auto-discovers", () => {
    const dbPath = seedDb();
    const cwd = dbPath.slice(0, dbPath.lastIndexOf("/"));
    const r = resolveDb(["users"], {}, cwd);
    expect(r.dbPath).toBe("app.db");
    expect(r.rest).toEqual(["users"]);
  });

  it("throws NO_DATABASE when nothing is found", () => {
    try {
      resolveDb([], {}, "/tmp/definitely-empty-" + Date.now());
    } catch (e) {
      expect((e as { code: string }).code).toBe("NO_DATABASE");
    }
  });
});
