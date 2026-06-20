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
