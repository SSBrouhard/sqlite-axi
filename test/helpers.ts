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
