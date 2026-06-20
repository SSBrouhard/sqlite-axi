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

/** Throw AxiError unless `sql` is a single SELECT / EXPLAIN [QUERY PLAN] SELECT statement. */
export function validateReadOnly(sql: string): void {
  const trimmed = stripLeadingComments(sql);
  if (!trimmed) {
    throw new AxiError("a SQL query is required", "VALIDATION_ERROR", [
      'sqlite-axi query "select ..."',
    ]);
  }

  const semi = trimmed.indexOf(";");
  if (semi !== -1 && trimmed.slice(semi + 1).trim() !== "") {
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
