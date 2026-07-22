import type { NextFunction, Request, Response } from 'express';
import { getSession } from '../lib/session-store.js';

export const SESSION_COOKIE_NAME = 'buku_sid';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminId?: number;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const session = getSession(token);

  if (!session) {
    res.status(401).json({ message: 'Belum login atau sesi sudah berakhir.' });
    return;
  }

  req.adminId = session.adminId;
  next();
}
