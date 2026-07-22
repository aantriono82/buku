import { describe, it, expect, afterEach } from 'vitest';
import bcrypt from 'bcrypt';
import { initDb, closeDb } from '../../db/connection.js';
import { seedAdminIfMissing } from '../../db/seed-admin.js';

describe('seedAdminIfMissing', () => {
  afterEach(() => {
    closeDb();
  });

  it('membuat admin dari username/password saat tabel kosong', () => {
    const db = initDb(':memory:');
    seedAdminIfMissing(db, 'aantriono', 'rahasia123');

    const admin = db.prepare('SELECT username, password_hash FROM admin').get() as {
      username: string;
      password_hash: string;
    };
    expect(admin.username).toBe('aantriono');
    expect(bcrypt.compareSync('rahasia123', admin.password_hash)).toBe(true);
  });

  it('tidak membuat admin kedua kalau sudah ada satu (idempotent)', () => {
    const db = initDb(':memory:');
    seedAdminIfMissing(db, 'aantriono', 'rahasia123');
    seedAdminIfMissing(db, 'lainnya', 'passwordlain');

    const count = db.prepare('SELECT COUNT(*) as count FROM admin').get() as { count: number };
    expect(count.count).toBe(1);
  });

  it('melempar error kalau env admin belum diset dan tabel masih kosong', () => {
    const db = initDb(':memory:');
    expect(() => seedAdminIfMissing(db, '', '')).toThrow();
  });
});
