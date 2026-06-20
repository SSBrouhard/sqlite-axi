import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverDatabases } from "../src/discover.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "discover-"));
}

describe("discoverDatabases", () => {
  it("finds db files in the dir and one level down, sorted", () => {
    const dir = tmp();
    writeFileSync(join(dir, "app.db"), "");
    mkdirSync(join(dir, "data"));
    writeFileSync(join(dir, "data", "cache.sqlite"), "");
    expect(discoverDatabases(dir)).toEqual(["app.db", join("data", "cache.sqlite")]);
  });

  it("skips junk and hidden directories", () => {
    const dir = tmp();
    for (const junk of ["node_modules", ".git", "dist"]) {
      mkdirSync(join(dir, junk));
      writeFileSync(join(dir, junk, "x.db"), "");
    }
    expect(discoverDatabases(dir)).toEqual([]);
  });

  it("ignores non-db files", () => {
    const dir = tmp();
    writeFileSync(join(dir, "notes.txt"), "");
    expect(discoverDatabases(dir)).toEqual([]);
  });
});
