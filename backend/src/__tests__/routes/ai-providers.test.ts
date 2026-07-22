import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { initDb, closeDb } from '../../db/connection.js';
import { seedAdminIfMissing } from '../../db/seed-admin.js';
import { createApp } from '../../app.js';
import { clearSessionsForTest } from '../../lib/session-store.js';
import { DEFAULT_TEXT_PROVIDER_CREDENTIALS, type TextProviderCredentials } from '../../services/ai-providers.js';

describe('GET /api/ai-providers', () => {
  let app: Express;
  let agent: ReturnType<typeof request.agent>;

  function setupApp(credentials: TextProviderCredentials): void {
    const db = initDb(':memory:');
    seedAdminIfMissing(db, 'admin', 'password123');
    app = createApp({ db, frontendUrl: 'http://localhost:5183', isProduction: false, credentials });
  }

  beforeEach(() => {
    clearSessionsForTest();
  });

  afterEach(() => {
    closeDb();
  });

  it('ditolak 401 kalau belum login', async () => {
    setupApp(DEFAULT_TEXT_PROVIDER_CREDENTIALS);
    const res = await request(app).get('/api/ai-providers');
    expect(res.status).toBe(401);
  });

  it('mengembalikan array kosong kalau tidak ada provider terkonfigurasi', async () => {
    setupApp(DEFAULT_TEXT_PROVIDER_CREDENTIALS);
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'password123' });

    const res = await agent.get('/api/ai-providers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('mengembalikan hanya provider yang api key-nya terisi', async () => {
    setupApp({
      ...DEFAULT_TEXT_PROVIDER_CREDENTIALS,
      OPENROUTER_API_KEY: 'key-1',
      ANTHROPIC_API_KEY: 'key-2',
    });
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'password123' });

    const res = await agent.get('/api/ai-providers');
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((p) => p.id).sort();
    expect(ids).toEqual(['anthropic', 'openrouter']);
  });
});
