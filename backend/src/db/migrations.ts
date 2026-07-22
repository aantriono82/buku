import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

/**
 * Migrasi versi & terurut. Sekali sebuah versi tercatat di schema_migrations pada suatu
 * deployment, ia tidak dijalankan ulang — jangan edit migrasi yang sudah dirilis, tambah
 * migrasi baru dengan version berikutnya. Skema mengikuti planning.md §3.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_admin',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS admin (
          id INTEGER PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          telegram_chat_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    },
  },
  {
    version: 2,
    name: 'create_buku',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS buku (
          id INTEGER PRIMARY KEY,
          judul TEXT NOT NULL,
          mapel TEXT NOT NULL,
          jenjang TEXT NOT NULL,
          kurikulum TEXT,
          status TEXT DEFAULT 'draft',
          channel_created TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME
        );
      `);
    },
  },
  {
    version: 3,
    name: 'create_bab',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS bab (
          id INTEGER PRIMARY KEY,
          buku_id INTEGER NOT NULL REFERENCES buku(id) ON DELETE CASCADE,
          urutan INTEGER NOT NULL,
          judul TEXT NOT NULL,
          ringkasan TEXT,
          status TEXT DEFAULT 'belum',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_bab_buku ON bab(buku_id);
      `);
    },
  },
  {
    version: 4,
    name: 'create_konten_blok',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS konten_blok (
          id INTEGER PRIMARY KEY,
          bab_id INTEGER NOT NULL REFERENCES bab(id) ON DELETE CASCADE,
          urutan INTEGER NOT NULL,
          tipe TEXT NOT NULL,
          data_json TEXT NOT NULL,
          file_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_konten_blok_bab ON konten_blok(bab_id);
      `);
    },
  },
  {
    version: 5,
    name: 'create_export_job',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS export_job (
          id INTEGER PRIMARY KEY,
          buku_id INTEGER NOT NULL REFERENCES buku(id) ON DELETE CASCADE,
          format TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          file_path TEXT,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_export_job_buku ON export_job(buku_id);
      `);
    },
  },
];

export default migrations;
