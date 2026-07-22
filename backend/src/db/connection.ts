import Database from 'better-sqlite3';
import { migrations } from './migrations.js';

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database belum diinisialisasi. Panggil initDb() terlebih dahulu.');
  }
  return db;
}

export function initDb(dbPath: string): Database.Database {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

/** Untuk test: reset koneksi supaya initDb() bisa dipanggil ulang dengan db baru. */
export function closeDb(): void {
  db?.close();
  db = undefined;
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = new Set(
    database
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => (row as { version: number }).version),
  );
  const pending = migrations.filter((m) => !applied.has(m.version)).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    const runMigration = database.transaction(() => {
      migration.up(database);
      database
        .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(migration.version, migration.name);
    });
    runMigration();
  }
}
