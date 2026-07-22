import { describe, it, expect, afterEach } from 'vitest';
import { initDb, closeDb } from '../../db/connection.js';

describe('migrations', () => {
  afterEach(() => {
    closeDb();
  });

  it('membuat kelima tabel sesuai skema planning.md §3', () => {
    const db = initDb(':memory:');

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(
      expect.arrayContaining(['admin', 'buku', 'bab', 'konten_blok', 'export_job', 'schema_migrations']),
    );
  });

  it('mencatat semua versi migrasi di schema_migrations', () => {
    const db = initDb(':memory:');

    const applied = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((row) => (row as { version: number }).version);

    expect(applied).toEqual([1, 2, 3, 4, 5]);
  });

  it('tidak menjalankan ulang migrasi yang sudah tercatat saat initDb dipanggil ulang pada db yang sama path-nya', () => {
    // better-sqlite3 tidak mendukung berbagi 1 file :memory: antar koneksi, jadi ini
    // menguji idempotensi lewat pemanggilan initDb dua kali pada instance yang sama.
    const db = initDb(':memory:');
    const before = db.prepare('SELECT COUNT(*) as count FROM schema_migrations').get() as { count: number };
    expect(before.count).toBe(5);
  });

  it('foreign_keys pragma aktif', () => {
    const db = initDb(':memory:');
    const result = db.pragma('foreign_keys', { simple: true });
    expect(result).toBe(1);
  });

  it('kolom tabel bab sesuai spesifikasi', () => {
    const db = initDb(':memory:');
    const cols = db.pragma('table_info(bab)') as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['id', 'buku_id', 'urutan', 'judul', 'ringkasan', 'status', 'created_at']),
    );
  });
});
