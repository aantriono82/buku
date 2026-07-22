import bcrypt from 'bcrypt';
import type Database from 'better-sqlite3';

/**
 * Single-admin app tanpa endpoint registrasi (lihat planning.md §5) — akun admin pertama
 * dibuat otomatis dari ADMIN_USERNAME/ADMIN_PASSWORD saat boot, hanya jika tabel admin
 * masih kosong. Aman dipanggil berkali-kali (idempotent).
 */
export function seedAdminIfMissing(db: Database.Database, username: string, password: string): void {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM admin').get() as { count: number };
  if (count > 0) {
    return;
  }
  if (!username || !password) {
    throw new Error('ADMIN_USERNAME dan ADMIN_PASSWORD wajib diatur untuk membuat akun admin pertama.');
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
}
