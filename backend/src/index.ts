import { loadConfig } from './config.js';
import { initDb } from './db/connection.js';
import { seedAdminIfMissing } from './db/seed-admin.js';
import { createApp } from './app.js';

const config = loadConfig();

const db = initDb(config.DB_PATH);
seedAdminIfMissing(db, config.ADMIN_USERNAME, config.ADMIN_PASSWORD);

const app = createApp({
  db,
  frontendUrl: config.FRONTEND_URL,
  isProduction: config.NODE_ENV === 'production',
  credentials: config,
  storageDir: config.STORAGE_DIR,
});

app.listen(config.PORT, () => {
  console.info(`buku-generator backend berjalan di port ${config.PORT}`);
});
