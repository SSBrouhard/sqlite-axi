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
