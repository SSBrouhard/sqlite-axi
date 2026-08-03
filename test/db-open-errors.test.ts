import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const { databaseError } = vi.hoisted(() => ({
  databaseError: { current: undefined as Error | undefined },
}));

vi.mock("better-sqlite3", () => ({
  default: class {
    constructor() {
      throw databaseError.current;
    }
  },
}));

import { openDb } from "../src/db.js";

function captureOpenError(): unknown {
  try {
    openDb(fileURLToPath(import.meta.url));
  } catch (error) {
    return error;
  }
  throw new Error("expected openDb to throw");
}

describe("database open errors", () => {
  it("reports native binding failures as SQLite runtime errors", () => {
    databaseError.current = Object.assign(
      new Error("The module was compiled against a different Node.js version"),
      { code: "ERR_DLOPEN_FAILED" },
    );

    expect(captureOpenError()).toMatchObject({
      code: "SQLITE_RUNTIME_ERROR",
      message: expect.stringContaining("different Node.js version"),
      suggestions: ["Reinstall sqlite-axi after changing Node.js versions"],
    });
  });

  it("reports database availability failures without blaming the file format", () => {
    databaseError.current = Object.assign(new Error("database is locked"), {
      code: "SQLITE_BUSY",
    });

    expect(captureOpenError()).toMatchObject({
      code: "DB_OPEN_ERROR",
      message: expect.stringContaining("database is locked"),
      suggestions: ["Check that the database is readable and not locked"],
    });
  });

  it.each(["SQLITE_CORRUPT", "SQLITE_CORRUPT_INDEX", "SQLITE_FORMAT"])(
    "retains INVALID_DB for %s database errors",
    (code) => {
      databaseError.current = Object.assign(new Error("database format is invalid"), { code });

      expect(captureOpenError()).toMatchObject({
        code: "INVALID_DB",
        suggestions: ["Confirm the file is a SQLite database"],
      });
    },
  );
});
