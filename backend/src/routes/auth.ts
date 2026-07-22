import { Router } from 'express';
import bcrypt from 'bcrypt';
import type Database from 'better-sqlite3';
import { createSession, destroySession } from '../lib/session-store.js';
import { requireAuth, SESSION_COOKIE_NAME } from '../middleware/require-auth.js';

interface AdminRow {
  id: number;
  username: string;
  password_hash: string;
}

export function authRoutes(db: Database.Database, isProduction: boolean): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ message: 'Username dan password wajib diisi.' });
      return;
    }

    const admin = db.prepare('SELECT id, username, password_hash FROM admin WHERE username = ?').get(username) as
      AdminRow | undefined;
    if (!admin) {
      res.status(401).json({ message: 'Username atau password salah.' });
      return;
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      res.status(401).json({ message: 'Username atau password salah.' });
      return;
    }

    const token = createSession(admin.id);
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 12 * 60 * 60 * 1000,
    });
    res.json({ username: admin.username });
  });

  router.post('/logout', requireAuth, (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (token) {
      destroySession(token);
    }
    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(204).end();
  });

  return router;
}
