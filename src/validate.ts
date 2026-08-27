import { AxiError } from "axi-sdk-js";

const READONLY_HELP =
  "only read-only queries are allowed (SELECT, WITH ... SELECT, EXPLAIN SELECT, EXPLAIN QUERY PLAN SELECT)";

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

function skipTrivia(sql: string, i: number): number {
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v") {
      i++;
      continue;
    }
    if (ch === "-" && next === "-") {
      const nl = sql.indexOf("\n", i + 2);
      if (nl === -1) return sql.length;
      i = nl + 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) return -1;
      i = end + 2;
      continue;
    }
    return i;
  }
  return i;
}

function matchKeyword(sql: string, i: number, keyword: string): number {
  const n = keyword.length;
  if (i < 0 || i + n > sql.length) return -1;
  if (sql.slice(i, i + n).toUpperCase() !== keyword) return -1;
  const after = sql[i + n];
  if (after !== undefined && /[A-Za-z0-9_$]/.test(after)) return -1;
  return i + n;
}

function skipQuoted(sql: string, i: number, quote: "'" | "\"" | "`"): number {
  i++;
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return -1;
}

function skipIdentifier(sql: string, i: number): number {
  const ch = sql[i];
  if (ch === "\"") return skipQuoted(sql, i, "\"");
  if (ch === "`") return skipQuoted(sql, i, "`");
  if (ch === "[") {
    const end = sql.indexOf("]", i + 1);
    return end === -1 ? -1 : end + 1;
  }
  if (ch !== undefined && /[A-Za-z_]/.test(ch)) {
    i++;
    while (i < sql.length && /[A-Za-z0-9_$]/.test(sql[i])) i++;
    return i;
  }
  return -1;
}

function skipParenGroup(sql: string, i: number): number {
  if (sql[i] !== "(") return -1;
  let depth = 0;
  let quote: "'" | "\"" | "`" | "[" | null = null;
  for (; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (quote === "'") {
      if (ch === "'" && next === "'") i++;
      else if (ch === "'") quote = null;
      continue;
    }
    if (quote === "\"" || quote === "`") {
      if (ch === quote && next === quote) i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (quote === "[") {
      if (ch === "]") quote = null;
      continue;
    }

    if (ch === "-" && next === "-") {
      const nl = sql.indexOf("\n", i + 2);
      if (nl === -1) return -1;
      i = nl;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    if (ch === "'" || ch === "\"" || ch === "`" || ch === "[") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** True when `sql` from `i` is SELECT / SELECT(...) / SELECT * (comments as trivia). */
function isSelectPrefix(sql: string, i: number): boolean {
  i = skipTrivia(sql, i);
  if (i < 0) return false;
  const after = matchKeyword(sql, i, "SELECT");
  if (after < 0) return false;
  if (after === sql.length) return true;
  const ch = sql[after];
  if (ch === "(" || ch === "*" || /\s/.test(ch)) return true;
  if (ch === "-" && sql[after + 1] === "-") return true;
  if (ch === "/" && sql[after + 1] === "*") return true;
  return false;
}

function skipMaterialized(sql: string, i: number): number {
  const notKw = matchKeyword(sql, i, "NOT");
  if (notKw >= 0) {
    const afterNot = skipTrivia(sql, notKw);
    if (afterNot < 0) return -1;
    const mat = matchKeyword(sql, afterNot, "MATERIALIZED");
    return mat < 0 ? -1 : mat;
  }
  const mat = matchKeyword(sql, i, "MATERIALIZED");
  return mat < 0 ? i : mat;
}

/**
 * Consume `WITH [RECURSIVE] cte [, cte]*` and require each CTE body plus the
 * trailing statement to be SELECT (or nested WITH ... SELECT). Returns the
 * index of the main SELECT, or -1.
 */
function skipWithClause(sql: string, i: number): number {
  i = matchKeyword(sql, i, "WITH");
  if (i < 0) return -1;
  i = skipTrivia(sql, i);
  if (i < 0) return -1;
  const recursive = matchKeyword(sql, i, "RECURSIVE");
  if (recursive >= 0) {
    i = skipTrivia(sql, recursive);
    if (i < 0) return -1;
  }

  for (;;) {
    i = skipTrivia(sql, i);
    if (i < 0) return -1;
    i = skipIdentifier(sql, i);
    if (i < 0) return -1;
    i = skipTrivia(sql, i);
    if (i < 0) return -1;
    if (sql[i] === "(") {
      i = skipParenGroup(sql, i);
      if (i < 0) return -1;
      i = skipTrivia(sql, i);
      if (i < 0) return -1;
    }
    i = matchKeyword(sql, i, "AS");
    if (i < 0) return -1;
    i = skipTrivia(sql, i);
    if (i < 0) return -1;
    i = skipMaterialized(sql, i);
    if (i < 0) return -1;
    i = skipTrivia(sql, i);
    if (i < 0) return -1;
    if (sql[i] !== "(") return -1;
    const bodyEnd = skipParenGroup(sql, i);
    if (bodyEnd < 0) return -1;
    if (!isSelectStmt(sql.slice(i + 1, bodyEnd - 1))) return -1;
    i = skipTrivia(sql, bodyEnd);
    if (i < 0) return -1;
    if (sql[i] === ",") {
      i++;
      continue;
    }
    return i;
  }
}

/** SELECT, or WITH ... SELECT, including fully-parenthesized wrapping. */
function isSelectStmt(sql: string): boolean {
  let i = skipTrivia(sql, 0);
  if (i < 0 || i >= sql.length) return false;
  if (sql[i] === "(") {
    const end = skipParenGroup(sql, i);
    if (end < 0) return false;
    if (skipTrivia(sql, end) !== sql.length) return false;
    return isSelectStmt(sql.slice(i + 1, end - 1));
  }
  if (matchKeyword(sql, i, "WITH") >= 0) {
    const main = skipWithClause(sql, i);
    return main >= 0 && isSelectPrefix(sql, main);
  }
  return isSelectPrefix(sql, i);
}

function isReadOnlyQuery(sql: string): boolean {
  let i = skipTrivia(sql, 0);
  if (i < 0) return false;
  const eqp = matchKeyword(sql, i, "EXPLAIN");
  if (eqp >= 0) {
    i = skipTrivia(sql, eqp);
    if (i < 0) return false;
    const queryKw = matchKeyword(sql, i, "QUERY");
    if (queryKw >= 0) {
      i = skipTrivia(sql, queryKw);
      if (i < 0) return false;
      const planKw = matchKeyword(sql, i, "PLAN");
      if (planKw < 0) return false;
      i = skipTrivia(sql, planKw);
      if (i < 0) return false;
    }
  }
  return isSelectStmt(sql.slice(i));
}

/** Throw AxiError unless `sql` is one read-only SELECT / WITH-SELECT / EXPLAIN SELECT. */
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

  if (!isReadOnlyQuery(trimmed)) {
    throw new AxiError(READONLY_HELP, "READ_ONLY", [
      'Example: sqlite-axi query "select * from users limit 10"',
    ]);
  }
}
