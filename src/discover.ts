import { readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";

const DB_EXT = /\.(db|sqlite|sqlite3)$/i;
const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".next", "coverage"]);

/** Find database files in `dir` and one level of subdirectories (skipping junk/hidden dirs). */
export function discoverDatabases(dir: string): string[] {
  const found: string[] = [];
  for (const entry of safeReaddir(dir)) {
    if (entry.isFile() && DB_EXT.test(entry.name)) {
      found.push(entry.name);
    } else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
      for (const sub of safeReaddir(join(dir, entry.name))) {
        if (sub.isFile() && DB_EXT.test(sub.name)) {
          found.push(join(entry.name, sub.name));
        }
      }
    }
  }
  return found.sort();
}

function safeReaddir(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
