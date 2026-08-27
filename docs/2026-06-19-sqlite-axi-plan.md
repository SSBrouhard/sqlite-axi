# sqlite-axi Implementation Plan

> Historical v1 build plan. Live query allowlist: README ("Read-only guarantee") and `src/validate.ts` (`WITH ... SELECT` is accepted; write CTEs stay refused).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sqlite-axi`, a read-only AXI CLI that inspects and queries SQLite databases with token-efficient TOON output.

**Architecture:** `better-sqlite3` opened `{ readonly: true }` is the hard read-only layer; a read-only SQL allowlist (see README / `src/validate.ts`) gives clean errors. Pure modules (discover, resolve, validate, format) feed four pure command transforms; `db.ts` is the only impure boundary. The SDK (`axi-sdk-js`) handles dispatch and TOON; a custom `formatError` maps usage-error codes to exit 2.

**Tech Stack:** TypeScript (ESM, NodeNext), `axi-sdk-js`, `better-sqlite3`, `@toon-format/toon`, vitest. Node ≥22.

---

## File structure

```
src/bin/sqlite-axi.ts   runAxiCli config, formatError, setup hooks
src/args.ts             flag parser (ported from npm-axi)
src/format.ts           renderCell, isSafeFieldName, buildRows
src/validate.ts         validateReadOnly (allowlist)
src/discover.ts         discoverDatabases (cwd + 1 level, skip junk)
src/resolve.ts          resolveDb (--db > file-like positional > discovery)
src/db.ts               openDb + metadata/query helpers (impure boundary)
src/commands/tables.ts
src/commands/schema.ts
src/commands/sample.ts
src/commands/query.ts
src/home.ts             no-args snapshot
src/help.ts             top-level + per-command help
test/helpers.ts         seedDb() — real temp SQLite fixture
test/*.test.ts          one per module
```

---

## Task 0: Scaffold and dependencies

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "sqlite-axi",
  "version": "0.1.0",
  "description": "Inspect and query SQLite databases read-only, with token-efficient output — an AXI (Agent eXperience Interface).",
  "keywords": ["axi", "agent", "cli", "sqlite", "database", "toon"],
  "license": "MIT",
  "author": "SSBrouhard",
  "homepage": "https://github.com/SSBrouhard/sqlite-axi",
  "repository": { "type": "git", "url": "git+https://github.com/SSBrouhard/sqlite-axi.git" },
  "type": "module",
  "bin": { "sqlite-axi": "dist/bin/sqlite-axi.js" },
  "files": ["dist", "README.md", "LICENSE"],
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/bin/sqlite-axi.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@toon-format/toon": "^2.3.0",
    "axi-sdk-js": "^0.1.7",
    "better-sqlite3": "^13.0.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^4.1.0"
  }
}
```

> Note: pin `@toon-format/toon` to the version `axi-sdk-js` resolves to. After `npm install`, run `npm ls @toon-format/toon` and set the caret range to that major.minor so the SDK and our direct import share one copy.

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules
dist
*.log
.DS_Store
```

- [ ] **Step 5: Install and verify the driver loads**

Run: `npm install && node -e "const D=require('better-sqlite3'); const db=new D(':memory:'); db.exec('create table t(x)'); console.log('ok', db.prepare('select 1 as n').get())"`
Expected: prints `ok { n: 1 }`. Then `npm ls @toon-format/toon` to confirm a single version; adjust the caret in `package.json` to match and re-run `npm install`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: scaffold sqlite-axi (better-sqlite3, axi-sdk-js, vitest)"
```

---

## Task 1: Test fixture helper

**Files:**
- Create: `test/helpers.ts`

- [ ] **Step 1: Write the seed helper**

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

/** Create a temp SQLite file seeded with a small schema and return its path. */
export function seedDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-axi-"));
  const path = join(dir, "app.db");
  const db = new Database(path);
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_users_created ON users(created_at);
    CREATE TABLE teams (id INTEGER PRIMARY KEY, label TEXT);
    CREATE TABLE memberships (
      user_id INTEGER,
      team_id INTEGER,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(team_id) REFERENCES teams(id)
    );
    CREATE VIEW active_users AS SELECT * FROM users;
  `);
  const insert = db.prepare("INSERT INTO users (email, name) VALUES (?, ?)");
  for (let i = 1; i <= 5; i++) insert.run(`u${i}@example.com`, `User ${i}`);
  db.prepare("INSERT INTO teams (label) VALUES ('A')").run();
  db.close();
  return path;
}

/** Seed a db that also has a table with an awkward name and column aliases. */
export function seedWeirdDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-axi-weird-"));
  const path = join(dir, "weird.sqlite");
  const db = new Database(path);
  db.exec('CREATE TABLE "odd name" ("a,b" TEXT, normal INTEGER);');
  db.prepare('INSERT INTO "odd name" ("a,b", normal) VALUES (?, ?)').run("hello", 1);
  db.close();
  return path;
}
```

- [ ] **Step 2: Commit**

```bash
git add test/helpers.ts
git commit -m "test: add seedDb fixture helper"
```

---

## Task 2: Arg parser

**Files:**
- Create: `src/args.ts`
- Test: `test/args.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
  it("clamps to [1, max] and falls back on invalid values", () => {
    expect(parseLimit("5", 10, 100)).toBe(5);
    expect(parseLimit("999", 10, 100)).toBe(100);
    expect(parseLimit(undefined, 10, 100)).toBe(10);
    expect(parseLimit("abc", 10, 100)).toBe(10);
    expect(parseLimit("10abc", 10, 100)).toBe(10);
    expect(parseLimit("1e9", 10, 100)).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/args.test.ts`
Expected: FAIL — cannot find module `../src/args.js`.

- [ ] **Step 3: Write `src/args.ts`**

```ts
export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Minimal flag parser. Supports `--key value`, `--key=value`, boolean `--flag`.
 * Names in `booleans` are always boolean even when followed by a non-flag token.
 */
export function parseFlags(args: string[], booleans: string[] = []): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith("--") && !booleans.includes(body)) {
      flags[body] = next;
      i++;
    } else {
      flags[body] = true;
    }
  }
  return { positionals, flags };
}

/** Parse a decimal `--limit` flag into a clamped positive integer. */
export function parseLimit(
  value: string | boolean | undefined,
  fallback: number,
  max: number,
): number {
  if (typeof value !== "string") return fallback;
  if (!/^\d+$/.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/args.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/args.ts test/args.test.ts
git commit -m "feat: add flag parser"
```

---

## Task 3: Formatting (renderCell, isSafeFieldName, buildRows)

**Files:**
- Create: `src/format.ts`
- Test: `test/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildRows, isSafeFieldName, renderCell } from "../src/format.js";

describe("renderCell", () => {
  it("renders nulls, numbers, blobs, and truncates long strings", () => {
    expect(renderCell(null)).toBe("");
    expect(renderCell(42)).toBe(42);
    expect(renderCell(new Uint8Array([1, 2, 3]))).toBe("<blob 3 bytes>");
    const long = "x".repeat(250);
    expect(String(renderCell(long))).toHaveLength(202); // 200 + " …"
    expect(renderCell(long, true)).toBe(long); // --full disables truncation
  });
});

describe("isSafeFieldName", () => {
  it("accepts identifiers, rejects names with spaces/commas/quotes", () => {
    expect(isSafeFieldName("user_id")).toBe(true);
    expect(isSafeFieldName("a,b")).toBe(false);
    expect(isSafeFieldName("has space")).toBe(false);
    expect(isSafeFieldName("1col")).toBe(false);
  });
});

describe("buildRows", () => {
  it("uses real keys when all column names are safe and unique", () => {
    const out = buildRows(["id", "email"], [[1, "a@b.com"]], false);
    expect(out).toEqual({ rows: [{ id: 1, email: "a@b.com" }] });
  });

  it("falls back to a columns map + c0..cN keys when names are unsafe", () => {
    const out = buildRows(["a,b", "id"], [["x", 7]], false, "result");
    expect(out).toEqual({
      columns: [{ index: 0, name: "a,b" }, { index: 1, name: "id" }],
      result: [{ c0: "x", c1: 7 }],
    });
  });

  it("falls back when column names are duplicated", () => {
    const out = buildRows(["id", "id"], [[1, 2]], false);
    expect(out.columns).toEqual([{ index: 0, name: "id" }, { index: 1, name: "id" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/format.test.ts`
Expected: FAIL — cannot find module `../src/format.js`.

- [ ] **Step 3: Write `src/format.ts`**

```ts
export type Cell = string | number;

/** A name usable as a bare TOON tabular field. */
export function isSafeFieldName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/** Render a SQLite cell value for output. Numbers stay numeric; everything else is a string. */
export function renderCell(value: unknown, full = false): Cell {
  if (value === null || value === undefined) return "";
  if (value instanceof Uint8Array) return `<blob ${value.length} bytes>`;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  const s = String(value);
  if (!full && s.length > 200) return `${s.slice(0, 200).trimEnd()} …`;
  return s;
}

/**
 * Turn (columnNames, rows) into an output fragment keyed by `key`.
 * Safe + unique names → objects keyed by the real names (compact tabular TOON).
 * Otherwise → a `columns` index→name map plus rows keyed c0..cN (always valid TOON).
 */
export function buildRows(
  columnNames: string[],
  rows: unknown[][],
  full: boolean,
  key = "rows",
): Record<string, unknown> {
  const unique = new Set(columnNames).size === columnNames.length;
  const safe = columnNames.length > 0 && unique && columnNames.every(isSafeFieldName);

  if (safe) {
    return {
      [key]: rows.map((row) => {
        const obj: Record<string, Cell> = {};
        columnNames.forEach((name, i) => {
          obj[name] = renderCell(row[i], full);
        });
        return obj;
      }),
    };
  }

  return {
    columns: columnNames.map((name, index) => ({ index, name })),
    [key]: rows.map((row) => {
      const obj: Record<string, Cell> = {};
      columnNames.forEach((_, i) => {
        obj[`c${i}`] = renderCell(row[i], full);
      });
      return obj;
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/format.ts test/format.test.ts
git commit -m "feat: add cell rendering and safe column-name handling"
```

---

## Task 4: Read-only validator

**Files:**
- Create: `src/validate.ts`
- Test: `test/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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

  it("rejects writes, PRAGMA, WITH, EXPLAIN UPDATE, and stacked statements", () => {
    for (const sql of [
      "update users set name='x'",
      "delete from users",
      "drop table users",
      "pragma table_info(users)",
      "with t as (select 1) select * from t",
      "explain update users set name='x'",
      "select 1; drop table users",
      "attach database 'x.db' as y",
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/validate.test.ts`
Expected: FAIL — cannot find module `../src/validate.js`.

- [ ] **Step 3: Write `src/validate.ts`**

```ts
import { AxiError } from "axi-sdk-js";

const READONLY_HELP =
  "only read-only queries are allowed (SELECT, EXPLAIN SELECT, EXPLAIN QUERY PLAN SELECT)";

/** Strip leading line (`--`) and block (`/* *\/`) comments and whitespace. */
function stripLeadingComments(sql: string): string {
  let s = sql.trim();
  for (;;) {
    if (s.startsWith("--")) {
      const nl = s.indexOf("\n");
      s = nl === -1 ? "" : s.slice(nl + 1).trimStart();
      continue;
    }
    if (s.startsWith("/*")) {
      const end = s.indexOf("*/");
      s = end === -1 ? "" : s.slice(end + 2).trimStart();
      continue;
    }
    return s;
  }
}

function stripTrailingComments(sql: string): string {
  let s = sql.trimEnd();
  for (;;) {
    const trimmed = s.trimEnd();
    if (trimmed.endsWith("*/")) {
      const start = trimmed.lastIndexOf("/*");
      if (start === -1) return trimmed;
      s = trimmed.slice(0, start);
      continue;
    }
    const lineComment = trimmed.lastIndexOf("--");
    if (lineComment !== -1 && trimmed.slice(lineComment).indexOf("\n") === -1) {
      s = trimmed.slice(0, lineComment);
      continue;
    }
    return trimmed;
  }
}

function hasStackedStatement(sql: string): boolean {
  let quote: "'" | "\"" | "`" | "[" | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (quote === "'") {
      if (ch === "'" && next === "'") {
        i++;
      } else if (ch === "'") {
        quote = null;
      }
      continue;
    }
    if (quote === "\"" || quote === "`") {
      if (ch === quote && next === quote) {
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (quote === "[") {
      if (ch === "]") quote = null;
      continue;
    }

    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i + 2);
      if (end === -1) return false;
      i = end;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) return false;
      i = end + 1;
      continue;
    }
    if (ch === "'" || ch === "\"" || ch === "`" || ch === "[") {
      quote = ch;
      continue;
    }
    if (ch === ";") {
      return stripTrailingComments(sql.slice(i + 1)).trim() !== "";
    }
  }
  return false;
}

/** Throw AxiError unless `sql` is a single SELECT / EXPLAIN [QUERY PLAN] SELECT statement. */
export function validateReadOnly(sql: string): void {
  const trimmed = stripLeadingComments(sql);
  if (!trimmed) {
    throw new AxiError("a SQL query is required", "VALIDATION_ERROR", [
      'sqlite-axi query "select ..."',
    ]);
  }

  if (hasStackedStatement(trimmed)) {
    throw new AxiError("only a single statement is allowed", "READ_ONLY", [READONLY_HELP]);
  }

  const normalized = trimmed.replace(/\s+/g, " ").toUpperCase();
  const ok =
    /^SELECT[\s(*]/.test(normalized) ||
    normalized === "SELECT" ||
    /^EXPLAIN QUERY PLAN SELECT[\s(*]/.test(normalized) ||
    /^EXPLAIN SELECT[\s(*]/.test(normalized);

  if (!ok) {
    throw new AxiError(READONLY_HELP, "READ_ONLY", [
      'Example: sqlite-axi query "select * from users limit 10"',
    ]);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/validate.ts test/validate.test.ts
git commit -m "feat: add read-only SQL allowlist"
```

---

## Task 5: Database discovery

**Files:**
- Create: `src/discover.ts`
- Test: `test/discover.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/discover.test.ts`
Expected: FAIL — cannot find module `../src/discover.js`.

- [ ] **Step 3: Write `src/discover.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/discover.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/discover.ts test/discover.test.ts
git commit -m "feat: add database auto-discovery"
```

---

## Task 6: Database resolution

**Files:**
- Create: `src/resolve.ts`
- Test: `test/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/resolve.test.ts`
Expected: FAIL — cannot find module `../src/resolve.js`.

- [ ] **Step 3: Write `src/resolve.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/resolve.ts test/resolve.test.ts
git commit -m "feat: add database resolution (flag/positional/discovery)"
```

---

## Task 7: Database boundary (`db.ts`)

**Files:**
- Create: `src/db.ts`
- Test: `test/db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  columns, foreignKeys, indexes, objectCounts, openDb, quoteIdent,
  rowCount, runQuery, sample, tableExists, tableNames,
} from "../src/db.js";
import { seedDb, seedWeirdDb } from "./helpers.js";

describe("db boundary", () => {
  it("opens read-only and rejects writes at the engine level", () => {
    const db = openDb(seedDb());
    expect(() => db.exec("INSERT INTO users (email) VALUES ('z@z.com')")).toThrow();
    db.close();
  });

  it("throws NOT_FOUND for a missing file", () => {
    try {
      openDb("/tmp/nope-" + Date.now() + ".db");
    } catch (e) {
      expect((e as { code: string }).code).toBe("NOT_FOUND");
    }
  });

  it("throws INVALID_DB for a non-SQLite file", () => {
    const dir = mkdtempSync(join(tmpdir(), "sqlite-axi-bad-"));
    const path = join(dir, "bad.db");
    writeFileSync(path, "this is not a sqlite database");
    try {
      openDb(path);
      throw new Error("expected openDb to throw");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("INVALID_DB");
    }
  });

  it("lists base tables and reports existence", () => {
    const db = openDb(seedDb());
    expect(tableNames(db)).toEqual(["memberships", "teams", "users"]);
    expect(tableExists(db, "users")).toBe(true);
    expect(tableExists(db, "active_users")).toBe(true); // view
    expect(tableExists(db, "ghost")).toBe(false);
    db.close();
  });

  it("returns columns, indexes, foreign keys, counts", () => {
    const db = openDb(seedDb());
    const cols = columns(db, "users");
    expect(cols[0]).toEqual({ name: "id", type: "INTEGER", pk: 1, notnull: 1, default: "" });
    expect(rowCount(db, "users")).toBe(5);
    expect(indexes(db, "users").some((i) => i.name === "idx_users_created")).toBe(true);
    expect(foreignKeys(db, "memberships")).toContainEqual({ column: "team_id", references: "teams.id" });
    expect(objectCounts(db)).toEqual({ tables: 3, views: 1, triggers: 0 });
    db.close();
  });

  it("resolves foreign key shorthand to the referenced primary key", () => {
    const dir = mkdtempSync(join(tmpdir(), "sqlite-axi-fk-"));
    const path = join(dir, "fk.db");
    const seed = new Database(path);
    seed.exec(`
      CREATE TABLE teams (id INTEGER PRIMARY KEY, label TEXT);
      CREATE TABLE memberships (team_id INTEGER REFERENCES teams);
    `);
    seed.close();

    const db = openDb(path);
    expect(foreignKeys(db, "memberships")).toEqual([
      { column: "team_id", references: "teams.id" },
    ]);
    db.close();
  });

  it("marks expression indexes instead of rendering blank columns", () => {
    const dir = mkdtempSync(join(tmpdir(), "sqlite-axi-index-"));
    const path = join(dir, "index.db");
    const seed = new Database(path);
    seed.exec(`
      CREATE TABLE users (name TEXT);
      CREATE INDEX idx_users_lower_name ON users(lower(name));
    `);
    seed.close();

    const db = openDb(path);
    expect(indexes(db, "users")).toContainEqual({
      name: "idx_users_lower_name",
      unique: 0,
      columns: "<expression>",
    });
    db.close();
  });

  it("samples a table with an awkward name via a quoted identifier", () => {
    const db = openDb(seedWeirdDb());
    const r = sample(db, "odd name", 10);
    expect(r.columnNames).toEqual(["a,b", "normal"]);
    expect(r.rows).toEqual([["hello", 1]]);
    db.close();
  });

  it("caps query rows at the limit and flags more available", () => {
    const db = openDb(seedDb());
    const r = runQuery(db, "select id from users", 3);
    expect(r.rows.length).toBe(3);
    expect(r.capped).toBe(true);
    db.close();
  });

  it("quotes identifiers safely", () => {
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/db.test.ts`
Expected: FAIL — cannot find module `../src/db.js`.

- [ ] **Step 3: Write `src/db.ts`**

```ts
import { statSync } from "node:fs";
import { AxiError } from "axi-sdk-js";
import Database from "better-sqlite3";

export type DB = Database.Database;

/** Existence guard for clean NOT_FOUND, then a hard read-only handle. */
export function openDb(path: string): DB {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) {
    throw new AxiError(`database file not found: ${path}`, "NOT_FOUND", [
      "Run `sqlite-axi` with no arguments to auto-discover a database",
    ]);
  }
  let db: Database.Database | undefined;
  try {
    db = new Database(path, { readonly: true });
    // better-sqlite3 opens lazily; force a header read so a non-SQLite file fails here.
    db.prepare("SELECT name FROM sqlite_master LIMIT 1").get();
  } catch {
    try { db?.close(); } catch { /* ignore close error */ }
    throw new AxiError(`not a valid SQLite database: ${path}`, "INVALID_DB", [
      "Confirm the file is a SQLite database",
    ]);
  }
  return db;
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function tableNames(db: DB): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((r) => (r as { name: string }).name);
}

export function tableExists(db: DB, name: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?")
      .get(name) !== undefined
  );
}

export function rowCount(db: DB, name: string): number {
  return (db.prepare(`SELECT count(*) AS n FROM ${quoteIdent(name)}`).get() as { n: number }).n;
}

export interface ColumnInfo {
  name: string;
  type: string;
  pk: number;
  notnull: number;
  default: string;
}

export function columns(db: DB, name: string): ColumnInfo[] {
  const rows = db
    .prepare('SELECT name, type, pk, "notnull" AS nn, dflt_value FROM pragma_table_info(?)')
    .all(name) as Array<{
    name: string;
    type: string;
    pk: number;
    nn: number;
    dflt_value: string | null;
  }>;
  return rows.map((r) => ({
    name: r.name,
    type: r.type,
    pk: r.pk,
    notnull: r.nn,
    default: r.dflt_value ?? "",
  }));
}

export interface IndexInfo {
  name: string;
  unique: number;
  columns: string;
}

export function indexes(db: DB, name: string): IndexInfo[] {
  const list = db
    .prepare('SELECT name, "unique" AS uniq FROM pragma_index_list(?)')
    .all(name) as Array<{ name: string; uniq: number }>;
  return list.map((idx) => ({
    name: idx.name,
    unique: idx.uniq,
    columns: indexColumns(db, idx.name),
  }));
}

function indexColumns(db: DB, name: string): string {
  const rows = db
    .prepare("SELECT name, cid, key FROM pragma_index_xinfo(?) WHERE key = 1 ORDER BY seqno")
    .all(name) as Array<{ name: string | null; cid: number; key: number }>;
  return rows
    .map((row) => {
      if (row.name) return row.name;
      if (row.cid === -2) return "<expression>";
      return "<unknown>";
    })
    .join(" ");
}

export interface ForeignKey {
  column: string;
  references: string;
}

export function foreignKeys(db: DB, name: string): ForeignKey[] {
  const rows = db
    .prepare('SELECT "table" AS tbl, "from" AS col, "to" AS ref FROM pragma_foreign_key_list(?)')
    .all(name) as Array<{ tbl: string; col: string; ref: string | null }>;
  return rows.map((r) => ({
    column: r.col,
    references: `${r.tbl}.${r.ref ?? primaryKeyColumn(db, r.tbl) ?? "<primary key>"}`,
  }));
}

function primaryKeyColumn(db: DB, table: string): string | null {
  const rows = db
    .prepare("SELECT name, pk FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk")
    .all(table) as Array<{ name: string; pk: number }>;
  if (rows.length === 1) return rows[0].name;
  return null;
}

export interface ObjectCounts {
  tables: number;
  views: number;
  triggers: number;
}

export function objectCounts(db: DB): ObjectCounts {
  const count = (type: string) =>
    (
      db
        .prepare(
          "SELECT count(*) AS n FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%'",
        )
        .get(type) as { n: number }
    ).n;
  return { tables: count("table"), views: count("view"), triggers: count("trigger") };
}

export interface QueryResult {
  columnNames: string[];
  rows: unknown[][];
  capped: boolean;
}

export function runQuery(db: DB, sql: string, limit: number): QueryResult {
  let stmt: Database.Statement;
  try {
    stmt = db.prepare(sql);
  } catch (error) {
    throw queryError(error);
  }
  const columnNames = stmt.columns().map((c) => c.name);
  const rows: unknown[][] = [];
  let capped = false;
  try {
    for (const row of stmt.raw().iterate()) {
      if (rows.length >= limit) {
        capped = true;
        break;
      }
      rows.push(row as unknown[]);
    }
  } catch (error) {
    throw queryError(error);
  }
  return { columnNames, rows, capped };
}

export function sample(db: DB, name: string, limit: number): QueryResult {
  const stmt = db.prepare(`SELECT * FROM ${quoteIdent(name)} LIMIT ?`);
  const columnNames = stmt.columns().map((c) => c.name);
  const rows = stmt.raw().all(limit) as unknown[][];
  return { columnNames, rows, capped: false };
}

function queryError(error: unknown): AxiError {
  const message = error instanceof Error ? error.message : String(error);
  return new AxiError(`query failed: ${message}`, "QUERY_ERROR", [
    "Check the SQL syntax and table/column names",
  ]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db.ts test/db.test.ts
git commit -m "feat: add read-only database boundary and metadata helpers"
```

---

## Task 8: `tables` command

**Files:**
- Create: `src/commands/tables.ts`
- Test: `test/tables.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { tablesCommand } from "../src/commands/tables.js";
import { seedDb } from "./helpers.js";

describe("tables", () => {
  it("lists tables with row and column counts", () => {
    const out = tablesCommand([seedDb()]);
    expect(out.count).toBe("3 tables");
    expect(out.tables).toContainEqual({ table: "users", rows: 5, columns: 4 });
    expect(out.help).toEqual(["Run `sqlite-axi schema <table-or-view>` for details"]);
  });

  it("rejects extra positional arguments", () => {
    try {
      tablesCommand([seedDb(), "users"]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("VALIDATION_ERROR");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tables.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/commands/tables.ts`**

```ts
import { parseFlags } from "../args.js";
import { AxiError } from "axi-sdk-js";
import { columns, openDb, rowCount, tableNames } from "../db.js";
import { resolveDb } from "../resolve.js";

export function tablesCommand(args: string[]): Record<string, unknown> {
  const { positionals, flags } = parseFlags(args);
  const { dbPath, rest } = resolveDb(positionals, flags);
  if (rest.length > 0) {
    throw new AxiError("tables does not accept table arguments", "VALIDATION_ERROR", [
      "Run `sqlite-axi tables [db]`",
      "Run `sqlite-axi schema <table-or-view>` for one table or view",
    ]);
  }
  const db = openDb(dbPath);
  try {
    const names = tableNames(db);
    if (names.length === 0) {
      return { database: dbPath, tables: "0 tables in this database" };
    }
    const tables = names.map((name) => ({
      table: name,
      rows: rowCount(db, name),
      columns: columns(db, name).length,
    }));
    return {
      database: dbPath,
      count: `${tables.length} tables`,
      tables,
      help: ["Run `sqlite-axi schema <table-or-view>` for details"],
    };
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tables.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/tables.ts test/tables.test.ts
git commit -m "feat: add tables command"
```

---

## Task 9: `schema` command

**Files:**
- Create: `src/commands/schema.ts`
- Test: `test/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { schemaCommand } from "../src/commands/schema.js";
import { seedDb } from "./helpers.js";

describe("schema", () => {
  it("returns columns, indexes, foreign keys, and row count", () => {
    const db = seedDb();
    const out = schemaCommand([db, "users"]);
    expect(out.table).toBe("users");
    expect(out.rows).toBe(5);
    expect((out.columns as unknown[]).length).toBe(4);
    expect(out.indexes).toBeDefined();
  });

  it("omits empty index/fk sections", () => {
    const out = schemaCommand([seedDb(), "teams"]);
    expect(out.indexes).toBeUndefined();
    expect(out.foreignKeys).toBeUndefined();
  });

  it("requires a table or view name (VALIDATION_ERROR)", () => {
    expect(() => schemaCommand([seedDb()])).toThrowError();
    try {
      schemaCommand([seedDb()]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("VALIDATION_ERROR");
    }
  });

  it("errors NOT_FOUND for an unknown table", () => {
    try {
      schemaCommand([seedDb(), "ghost"]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("NOT_FOUND");
    }
  });

  it("rejects extra positional arguments", () => {
    try {
      schemaCommand([seedDb(), "users", "extra"]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("VALIDATION_ERROR");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/schema.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/commands/schema.ts`**

```ts
import { AxiError } from "axi-sdk-js";
import { parseFlags } from "../args.js";
import { columns, foreignKeys, indexes, openDb, rowCount, tableExists } from "../db.js";
import { resolveDb } from "../resolve.js";

export function schemaCommand(args: string[]): Record<string, unknown> {
  const { positionals, flags } = parseFlags(args);
  const { dbPath, rest } = resolveDb(positionals, flags);
  const table = rest[0];
  if (!table) {
    throw new AxiError("a table or view name is required", "VALIDATION_ERROR", [
      "Run `sqlite-axi tables` to list tables, then `sqlite-axi schema <table-or-view>`",
    ]);
  }
  if (rest.length > 1) {
    throw new AxiError("schema accepts exactly one table or view name", "VALIDATION_ERROR", [
      "Run `sqlite-axi schema [db] <table-or-view>`",
    ]);
  }
  const db = openDb(dbPath);
  try {
    if (!tableExists(db, table)) {
      throw new AxiError(`table or view "${table}" not found`, "NOT_FOUND", [
        "Run `sqlite-axi tables` to list available tables",
      ]);
    }
    const out: Record<string, unknown> = {
      table,
      rows: rowCount(db, table),
      columns: columns(db, table),
    };
    const idx = indexes(db, table);
    if (idx.length > 0) out.indexes = idx;
    const fks = foreignKeys(db, table);
    if (fks.length > 0) out.foreignKeys = fks;
    return out;
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/schema.ts test/schema.test.ts
git commit -m "feat: add schema command"
```

---

## Task 10: `sample` command

**Files:**
- Create: `src/commands/sample.ts`
- Test: `test/sample.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { sampleCommand } from "../src/commands/sample.js";
import { seedDb, seedWeirdDb } from "./helpers.js";

describe("sample", () => {
  it("returns capped rows with a total count", () => {
    const out = sampleCommand([seedDb(), "users", "--limit", "2"]);
    expect(out.count).toBe("2 of 5 rows");
    expect((out.rows as unknown[]).length).toBe(2);
  });

  it("falls back to a columns map for unsafe column names", () => {
    const out = sampleCommand([seedWeirdDb(), "odd name"]);
    expect(out.columns).toEqual([{ index: 0, name: "a,b" }, { index: 1, name: "normal" }]);
    expect(out.rows).toEqual([{ c0: "hello", c1: 1 }]);
  });

  it("errors NOT_FOUND for an unknown table", () => {
    try {
      sampleCommand([seedDb(), "ghost"]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("NOT_FOUND");
    }
  });

  it("rejects extra positional arguments", () => {
    try {
      sampleCommand([seedDb(), "users", "extra"]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("VALIDATION_ERROR");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sample.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/commands/sample.ts`**

```ts
import { AxiError } from "axi-sdk-js";
import { parseFlags, parseLimit } from "../args.js";
import { openDb, rowCount, sample, tableExists } from "../db.js";
import { buildRows } from "../format.js";
import { resolveDb } from "../resolve.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 1000;

export function sampleCommand(args: string[]): Record<string, unknown> {
  const { positionals, flags } = parseFlags(args, ["full"]);
  const { dbPath, rest } = resolveDb(positionals, flags);
  const table = rest[0];
  if (!table) {
    throw new AxiError("a table or view name is required", "VALIDATION_ERROR", [
      "sqlite-axi sample <table-or-view> [--limit 10]",
    ]);
  }
  if (rest.length > 1) {
    throw new AxiError("sample accepts exactly one table or view name", "VALIDATION_ERROR", [
      "Run `sqlite-axi sample [db] <table-or-view> [--limit 10]`",
    ]);
  }
  const limit = parseLimit(flags.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const full = flags.full === true;
  const db = openDb(dbPath);
  try {
    if (!tableExists(db, table)) {
      throw new AxiError(`table or view "${table}" not found`, "NOT_FOUND", [
        "Run `sqlite-axi tables` to list available tables",
      ]);
    }
    const total = rowCount(db, table);
    const result = sample(db, table, limit);
    return {
      table,
      count: `${result.rows.length} of ${total} rows`,
      ...buildRows(result.columnNames, result.rows, full),
    };
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sample.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/sample.ts test/sample.test.ts
git commit -m "feat: add sample command"
```

---

## Task 11: `query` command

**Files:**
- Create: `src/commands/query.ts`
- Test: `test/query.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/query.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/commands/query.ts`**

```ts
import { parseFlags, parseLimit } from "../args.js";
import { openDb, runQuery } from "../db.js";
import { buildRows } from "../format.js";
import { resolveDb } from "../resolve.js";
import { validateReadOnly } from "../validate.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

export function queryCommand(args: string[]): Record<string, unknown> {
  const { positionals, flags } = parseFlags(args, ["full"]);
  const { dbPath, rest } = resolveDb(positionals, flags);
  const sql = rest.join(" ").trim();
  validateReadOnly(sql); // throws on empty / non-read-only
  const limit = parseLimit(flags.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const full = flags.full === true;
  const db = openDb(dbPath);
  try {
    const result = runQuery(db, sql, limit);
    const status = result.capped
      ? `${result.rows.length} (capped, more rows available)`
      : `${result.rows.length} (complete)`;
    return {
      database: dbPath,
      rows: status,
      ...buildRows(result.columnNames, result.rows, full, "result"),
    };
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/query.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/query.ts test/query.test.ts
git commit -m "feat: add read-only query command"
```

---

## Task 12: Home view

**Files:**
- Create: `src/home.ts`
- Test: `test/home.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/home.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/home.ts`**

```ts
import { isAbsolute, join } from "node:path";
import { discoverDatabases } from "./discover.js";
import { objectCounts, openDb, rowCount, tableNames } from "./db.js";

const HELP = [
  "Run `sqlite-axi tables` to list tables with row counts",
  "Run `sqlite-axi schema <table-or-view>` for columns, keys, and indexes",
  "Run `sqlite-axi sample <table-or-view>` to preview rows",
  'Run `sqlite-axi query "select ..."` to run a read-only query',
];

export function homeCommand(
  _args: string[] = [],
  _context?: unknown,
  cwd: string = process.cwd(),
): Record<string, unknown> {
  const found = discoverDatabases(cwd);
  if (found.length === 0) {
    return { databases: "no SQLite database found in the current directory", help: HELP };
  }
  if (found.length > 1) {
    return {
      databases: found,
      help: ["Pick one with --db, e.g. `sqlite-axi tables --db <path>`"],
    };
  }

  const dbPath = found[0];
  const absPath = isAbsolute(dbPath) ? dbPath : join(cwd, dbPath);
  const db = openDb(absPath);
  try {
    const names = tableNames(db);
    const counts = names.map((name) => ({ table: name, rows: rowCount(db, name) }));
    const totalRows = counts.reduce((sum, t) => sum + t.rows, 0);
    const largest = [...counts].sort((a, b) => b.rows - a.rows).slice(0, 5);
    const oc = objectCounts(db);
    return {
      database: dbPath,
      tables: `${names.length} (${totalRows} rows total)`,
      largest,
      objects: `${oc.views} views, ${oc.triggers} triggers`,
      help: [HELP[1], HELP[3]],
    };
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/home.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/home.ts test/home.test.ts
git commit -m "feat: add no-args schema snapshot home view"
```

---

## Task 13: Help text and CLI entry point

**Files:**
- Create: `src/help.ts`, `src/bin/sqlite-axi.ts`

- [ ] **Step 1: Write `src/help.ts`**

```ts
export const TOP_LEVEL_HELP = `sqlite-axi — inspect and query SQLite databases (read-only)

Usage: sqlite-axi <command> [db] [args] [flags]

Commands:
  tables [db]                    List tables with row and column counts
  schema [db] <table-or-view>    Columns, indexes, foreign keys, row count
  sample [db] <table-or-view> [--limit]  Preview rows (default 10)
  query  [db] "<sql>" [--limit]  Run a read-only SELECT (default 50 rows)
  setup hooks                    Install agent session-start hooks

The database is auto-discovered in the current directory, or given as a
file-like positional or with --db <path>. Run with no arguments for a
schema snapshot. Run \`sqlite-axi <command> --help\` for details.
`;

export const COMMAND_HELP: Record<string, string> = {
  tables: `sqlite-axi tables [db]

List base tables with row counts and column counts.

Examples:
  sqlite-axi tables
  sqlite-axi tables app.db
`,
  schema: `sqlite-axi schema [db] <table-or-view>

Show a table or view's columns (type, pk, notnull, default), indexes, and foreign keys.

Examples:
  sqlite-axi schema users
  sqlite-axi schema app.db users
`,
  sample: `sqlite-axi sample [db] <table-or-view> [--limit 10] [--full]

Preview rows from a table or view. Cells over 200 chars truncate unless --full is given.

Flags:
  --limit <n>   Decimal rows to show (default 10, max 1000)
  --full        Do not truncate cell values

Examples:
  sqlite-axi sample users
  sqlite-axi sample users --limit 25
`,
  query: `sqlite-axi query [db] "<sql>" [--limit 50] [--full]

Run a single read-only query: SELECT, EXPLAIN SELECT, or EXPLAIN QUERY PLAN SELECT.
Writes, PRAGMA, WITH, and stacked statements are rejected.

Flags:
  --limit <n>   Decimal max rows returned (default 50, max 1000)
  --full        Do not truncate cell values

Examples:
  sqlite-axi query "select id, email from users where name like 'A%'"
  sqlite-axi query "explain query plan select * from users" 
`,
  setup: `sqlite-axi setup hooks

Install or repair session-start hooks so agents see the schema snapshot at the
start of each session (Claude Code, Codex, OpenCode). Idempotent.

Examples:
  sqlite-axi setup hooks
`,
};
```

- [ ] **Step 2: Write `src/bin/sqlite-axi.ts`**

```ts
#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "@toon-format/toon";
import { AxiError, installSessionStartHooks, runAxiCli } from "axi-sdk-js";
import { queryCommand } from "../commands/query.js";
import { sampleCommand } from "../commands/sample.js";
import { schemaCommand } from "../commands/schema.js";
import { tablesCommand } from "../commands/tables.js";
import { COMMAND_HELP, TOP_LEVEL_HELP } from "../help.js";
import { homeCommand } from "../home.js";

const USAGE_CODES = new Set(["VALIDATION_ERROR", "READ_ONLY", "DB_AMBIGUOUS"]);

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "../../package.json"), "utf8")) as {
      version?: string;
    };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function formatError(error: unknown): { output: string; exitCode: number } {
  if (error instanceof AxiError) {
    const out: Record<string, unknown> = { error: error.message, code: error.code };
    if (error.suggestions.length > 0) out.help = error.suggestions;
    return { output: `${encode(out)}\n`, exitCode: USAGE_CODES.has(error.code) ? 2 : 1 };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { output: `${encode({ error: message, code: "UNKNOWN" })}\n`, exitCode: 1 };
}

await runAxiCli({
  description: "Inspect and query SQLite databases read-only",
  version: readVersion(),
  topLevelHelp: TOP_LEVEL_HELP,
  getCommandHelp: (command) => COMMAND_HELP[command] ?? null,
  home: (args) => homeCommand(args),
  formatError,
  commands: {
    tables: (args) => tablesCommand(args),
    schema: (args) => schemaCommand(args),
    sample: (args) => sampleCommand(args),
    query: (args) => queryCommand(args),
    setup: async (args) => {
      if (args[0] !== "hooks") {
        throw new AxiError("unknown setup command", "VALIDATION_ERROR", [
          "Run `sqlite-axi setup hooks`",
        ]);
      }
      installSessionStartHooks({ marker: "sqlite-axi", binaryNames: ["sqlite-axi"] });
      return { setup: "hooks installed or already up to date" };
    },
  },
});
```

- [ ] **Step 3: Build, then live smoke test**

Run:
```bash
npm run build && chmod +x dist/bin/sqlite-axi.js
SMOKE_DIR="$(mktemp -d)"
node -e "const D=require('better-sqlite3'); const db=new D(process.argv[1]); db.exec('create table t(a,b); insert into t values (1,2),(3,4)'); db.close()" "$SMOKE_DIR/smoke.db"
cd "$SMOKE_DIR" && node "$OLDPWD/dist/bin/sqlite-axi.js"          # home snapshot of smoke.db
node "$OLDPWD/dist/bin/sqlite-axi.js" tables
node "$OLDPWD/dist/bin/sqlite-axi.js" schema t
node "$OLDPWD/dist/bin/sqlite-axi.js" sample t
node "$OLDPWD/dist/bin/sqlite-axi.js" query "select a from t"
node "$OLDPWD/dist/bin/sqlite-axi.js" query "delete from t"; echo "exit=$?"   # expect READ_ONLY, exit 2
node "$OLDPWD/dist/bin/sqlite-axi.js" schema; echo "exit=$?"                   # expect VALIDATION_ERROR, exit 2
```
Expected: TOON snapshots for the read commands; the write query prints a `READ_ONLY` error and `exit=2`; bare `schema` prints `VALIDATION_ERROR` and `exit=2`.

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc -p tsconfig.json --noEmit`
Expected: all tests PASS; `tsc` reports no errors.

- [ ] **Step 5: Commit**

```bash
git add src/help.ts src/bin/sqlite-axi.ts
git commit -m "feat: wire CLI entry point, help, and setup hooks"
```

---

## Task 14: Skill, README, license, CI

**Files:**
- Create: `.agents/skills/sqlite-axi/SKILL.md`, `README.md`, `LICENSE`, `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.agents/skills/sqlite-axi/SKILL.md`**

```markdown
---
name: sqlite-axi
description: >
  Use when you need to inspect or query a local SQLite database — list tables,
  see a table/view's columns/keys/indexes, preview rows, or run a read-only SELECT.
  Token-efficient TOON output. Read-only; no writes are possible.
---

# sqlite-axi

`sqlite-axi` is an [AXI](https://github.com/kunchenguid/axi) for SQLite. It opens databases
**read-only** and returns token-efficient TOON. The database is auto-discovered in the current
directory or one level down, or passed as a file path / `--db`.

Run without a global install:

```sh
npx -y sqlite-axi <command>
```

## Commands

- `sqlite-axi tables [db]` — base tables with row and column counts.
- `sqlite-axi schema [db] <table-or-view>` — columns (type, pk, notnull, default), indexes, foreign keys.
- `sqlite-axi sample [db] <table-or-view> [--limit 10] [--full]` — preview rows; cells truncate unless `--full`.
- `sqlite-axi query [db] "<sql>" [--limit 50] [--full]` — a single read-only query
  (`SELECT` / `EXPLAIN SELECT` / `EXPLAIN QUERY PLAN SELECT` only).

## Notes

- Read-only is enforced two ways: the file is opened with SQLite's read-only flag, and a
  validator rejects anything but the allowed read statements.
- `--limit` flags accept decimal integers and cap at 1000 rows.
- Errors are structured TOON on stdout with a `help` line. Exit codes: `0` ok, `1` error,
  `2` usage/read-only violation.
- Unknown table/view → `NOT_FOUND` suggesting `sqlite-axi tables`.
```

- [ ] **Step 2: Write `README.md`**

```markdown
<h1 align="center">sqlite-axi</h1>

<p align="center">Inspect and query SQLite databases read-only, with token-efficient output — an <a href="https://github.com/kunchenguid/axi">AXI</a>.</p>

---

`sqlite-axi` wraps SQLite in an agent-ergonomic CLI. It auto-discovers a database in the
current directory or one level down and returns [TOON](https://toonformat.dev/) — compact schema snapshots and
capped query results instead of walls of JSON. Read-only by construction.

## Install

```sh
npm install -g sqlite-axi
```

Or run without installing:

```sh
npx -y sqlite-axi <command>
```

## Usage

```sh
$ sqlite-axi                      # auto-discovered snapshot
database: ./app.db
tables: 3 (6 rows total)
largest[3]{table,rows}:
  users,5
  teams,1
  memberships,0
objects: 1 views, 0 triggers

$ sqlite-axi schema users
table: users
rows: 5
columns[4]{name,type,pk,notnull,default}:
  id,INTEGER,1,1,
  email,TEXT,0,1,

$ sqlite-axi query "select id, email from users limit 2"
database: ./app.db
rows: 2 (complete)
result[2]{id,email}:
  1,u1@example.com
  2,u2@example.com
```

`tables [db]` lists base tables. `schema [db] <table-or-view>` and
`sample [db] <table-or-view>` inspect one object. `query [db] "<sql>"` runs a single read-only
statement. A database can also be selected with `--db <path>`. `--limit` accepts decimal integers
and caps rows at 1000;
`--full` disables 200-character cell truncation for `sample` and `query`.

## Read-only guarantee

Two independent layers: the database is opened with SQLite's read-only flag (the engine rejects
every write), and a validator accepts only `SELECT`, `EXPLAIN SELECT`, and `EXPLAIN QUERY PLAN
SELECT`. Writes, `PRAGMA`, `WITH`, and stacked statements are refused with a structured error.

## Agent integration

```sh
sqlite-axi setup hooks                         # ambient SessionStart snapshot
npx skills add SSBrouhard/sqlite-axi --skill sqlite-axi
```

## Development

```sh
npm install
npm test          # vitest against real temp SQLite files
npm run build
npm run dev -- tables app.db
```

## License

[MIT](LICENSE)
```

- [ ] **Step 3: Write `LICENSE`** (MIT, copyright 2026 SSBrouhard — copy the standard MIT text used in npm-axi).

- [ ] **Step 4: Write `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm test
```

- [ ] **Step 5: Verify audit is clean and commit**

Run: `npm audit --omit=dev` (expect 0 vulnerabilities in shipped deps), then:

```bash
git add .agents README.md LICENSE .github
git commit -m "docs: add skill, README, license, and CI"
```

---

## Self-review (completed during planning)

- **Spec coverage:** auto-discovery (T5/T6/T12), `[db]` resolution rule (T6), tables/schema/sample/query (T8–T11), home snapshot contents — db path, tables+rows, top-5 largest, views/triggers, help (T12), driver RO + statSync guard (T7), `SELECT`/`EXPLAIN` allowlist incl. tightened EXPLAIN forms (T4), identifier safety via bound-param pragmas + quoted `sample` (T7), column-name fallback (T3 + tested in T10/T11), cell/blob/null truncation (T3), error table + exit-code mapping via `formatError` (T13), ambient hooks + skill (T13/T14). All present.
- **Placeholders:** none — every code step is complete. The only prose step is the MIT license text (T14 S3), explicitly "copy the standard MIT text."
- **Type consistency:** `QueryResult { columnNames, rows, capped }`, `buildRows(columnNames, rows, full, key?)`, `resolveDb(positionals, flags, cwd?) -> { dbPath, rest }`, `openDb(path) -> DB`, and `ColumnInfo`/`IndexInfo`/`ForeignKey` shapes are used identically across db.ts, the commands, and home.ts.
- **`@toon-format/toon` version:** Task 0 Step 5 reconciles our direct dependency to the version `axi-sdk-js` resolves, avoiding a duplicate copy.
