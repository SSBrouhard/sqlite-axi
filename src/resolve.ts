import { statSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { AxiError } from "axi-sdk-js";
import { discoverDatabases } from "./discover.js";

const DB_EXT = /\.(db|sqlite|sqlite3)$/i;

export interface ResolvedDb {
  dbPath: string;
  rest: string[];
}

function looksLikeDb(token: string, cwd: string): boolean {
  if (DB_EXT.test(token)) return true;
  const p = isAbsolute(token) ? token : resolvePath(cwd, token);
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Decide which database to use and which positionals remain as command args. */
export function resolveDb(
  positionals: string[],
  flags: Record<string, string | boolean>,
  cwd: string = process.cwd(),
): ResolvedDb {
  if (typeof flags.db === "string") {
    return { dbPath: flags.db, rest: positionals };
  }
  if (positionals.length > 0 && looksLikeDb(positionals[0], cwd)) {
    return { dbPath: positionals[0], rest: positionals.slice(1) };
  }
  const found = discoverDatabases(cwd);
  if (found.length === 0) {
    throw new AxiError("no SQLite database found in the current directory", "NO_DATABASE", [
      "Pass a path: sqlite-axi <command> <db>",
      "Or set it explicitly: sqlite-axi <command> --db <path>",
    ]);
  }
  if (found.length > 1) {
    throw new AxiError(
      "multiple databases found — choose one with --db",
      "DB_AMBIGUOUS",
      found.map((f) => `sqlite-axi <command> --db ${f}`),
    );
  }
  return { dbPath: found[0], rest: positionals };
}
