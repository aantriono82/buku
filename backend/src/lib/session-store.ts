import crypto from 'node:crypto';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface SessionEntry {
  adminId: number;
  expiresAt: number;
}

const sessions = new Map<string, SessionEntry>();

function cleanupExpired(now: number): void {
  for (const [token, entry] of sessions.entries()) {
    if (entry.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

export function createSession(adminId: number): string {
  const now = Date.now();
  cleanupExpired(now);

  const token = crypto.randomUUID();
  sessions.set(token, { adminId, expiresAt: now + SESSION_TTL_MS });
  return token;
}

export function getSession(token: string | undefined): { adminId: number } | null {
  if (!token) {
    return null;
  }

  const now = Date.now();
  const entry = sessions.get(token);
  if (!entry || entry.expiresAt <= now) {
    sessions.delete(token);
    return null;
  }

  return { adminId: entry.adminId };
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

/** Hanya untuk test: kosongkan seluruh session di antara test case. */
export function clearSessionsForTest(): void {
  sessions.clear();
}
