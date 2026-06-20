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

/** Parse a `--limit` flag into a clamped positive integer. */
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
