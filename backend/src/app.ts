import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type Database from 'better-sqlite3';
import { authRoutes } from './routes/auth.js';
import { errorHandler } from './middleware/error-handler.js';

export interface AppOptions {
  db: Database.Database;
  frontendUrl: string;
  isProduction: boolean;
}

export function createApp({ db, frontendUrl, isProduction }: AppOptions): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(cors({ origin: frontendUrl, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));
  app.use('/api/auth', authRoutes(db, isProduction));

  app.use(errorHandler);

  return app;
}
