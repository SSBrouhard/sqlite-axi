import { describe, expect, it } from "vitest";
import { parseFlags, parseLimit } from "../src/args.js";

describe("parseFlags", () => {
  it("splits positionals and flags, with --key value and --key=value", () => {
    const r = parseFlags(["users", "--limit", "5", "--db=app.db"]);
    expect(r.positionals).toEqual(["users"]);
    expect(r.flags).toEqual({ limit: "5", db: "app.db" });
  });

  it("treats names in the booleans list as boolean even before a value", () => {
    const r = parseFlags(["--full", "users"], ["full"]);
    expect(r.flags.full).toBe(true);
    expect(r.positionals).toEqual(["users"]);
  });
});

describe("parseLimit", () => {
  it("clamps to [1, max] and falls back on junk", () => {
    expect(parseLimit("5", 10, 100)).toBe(5);
    expect(parseLimit("999", 10, 100)).toBe(100);
    expect(parseLimit(undefined, 10, 100)).toBe(10);
    expect(parseLimit("abc", 10, 100)).toBe(10);
  });
});
