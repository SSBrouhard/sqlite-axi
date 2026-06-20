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
