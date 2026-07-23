import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type Database from 'better-sqlite3';
import { authRoutes } from './routes/auth.js';
import { bukuRoutes } from './routes/buku.js';
import { babRoutes } from './routes/bab.js';
import { gambarRoutes } from './routes/gambar.js';
import { bukuExportRoutes, exportJobRoutes } from './routes/export.js';
import { aiProviderRoutes } from './routes/ai-providers.js';
import { DEFAULT_TEXT_PROVIDER_CREDENTIALS, type TextProviderCredentials } from './services/ai-providers.js';
import type { ImageProvider } from './services/image-service.js';
import { errorHandler } from './middleware/error-handler.js';
import { requireAuth } from './middleware/require-auth.js';

export interface AppOptions {
  db: Database.Database;
  frontendUrl: string;
  isProduction: boolean;
  credentials?: TextProviderCredentials;
  storageDir?: string;
  imageProvider?: ImageProvider;
}

export function createApp({
  db,
  frontendUrl,
  isProduction,
  credentials = DEFAULT_TEXT_PROVIDER_CREDENTIALS,
  storageDir = './data/storage',
  imageProvider,
}: AppOptions): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(cors({ origin: frontendUrl, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));
  app.use('/api/storage', requireAuth, express.static(storageDir));
  app.use('/api/auth', authRoutes(db, isProduction));
  app.use('/api/ai-providers', aiProviderRoutes(credentials));
  app.use('/api/buku', bukuRoutes({ db, credentials }));
  app.use('/api/buku', bukuExportRoutes({ db, storageDir }));
  app.use('/api/bab', babRoutes({ db, credentials, storageDir, imageProvider }));
  app.use('/api/blok', gambarRoutes({ db, storageDir, imageProvider }));
  app.use('/api/export', exportJobRoutes({ db, storageDir }));

  app.use(errorHandler);

  return app;
}
