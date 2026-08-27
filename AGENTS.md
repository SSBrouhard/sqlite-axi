# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Query allowlist

`sqlite-axi query` accepts one read-only statement: `SELECT`, `WITH ... SELECT`, or `EXPLAIN [QUERY PLAN]` of those. The SQL validator is `src/validate.ts`; the engine layer is `openDb` in `src/db.ts` (`readonly: true`). Write CTEs (`WITH ... INSERT/UPDATE/DELETE`) stay refused.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
