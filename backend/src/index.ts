import { loadConfig } from './config.js';
import { initDb } from './db/connection.js';
import { seedAdminIfMissing } from './db/seed-admin.js';
import { createApp } from './app.js';
import { GeminiImageProvider } from './services/gemini-image-provider.js';
import type { ImageProvider } from './services/image-service.js';

const config = loadConfig();

const db = initDb(config.DB_PATH);
seedAdminIfMissing(db, config.ADMIN_USERNAME, config.ADMIN_PASSWORD);

function resolveImageProvider(): ImageProvider | undefined {
  if (config.IMAGE_PROVIDER === 'gemini' && config.GOOGLE_AI_API_KEY) {
    return new GeminiImageProvider({ apiKey: config.GOOGLE_AI_API_KEY });
  }
  return undefined;
}

const app = createApp({
  db,
  frontendUrl: config.FRONTEND_URL,
  isProduction: config.NODE_ENV === 'production',
  credentials: config,
  storageDir: config.STORAGE_DIR,
  imageProvider: resolveImageProvider(),
});

app.listen(config.PORT, () => {
  console.info(`buku-generator backend berjalan di port ${config.PORT}`);
});
