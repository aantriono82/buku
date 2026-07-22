import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { initDb, closeDb } from '../../db/connection.js';
import { seedAdminIfMissing } from '../../db/seed-admin.js';
import { createApp } from '../../app.js';
import { clearSessionsForTest } from '../../lib/session-store.js';

describe('auth routes', () => {
  let app: Express;

  beforeEach(() => {
    clearSessionsForTest();
    const db = initDb(':memory:');
    seedAdminIfMissing(db, 'admin', 'password123');
    app = createApp({ db, frontendUrl: 'http://localhost:5183', isProduction: false });
  });

  afterEach(() => {
    closeDb();
  });

  it('GET /api/health mengembalikan status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('login gagal dengan password salah', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'salah' });
    expect(res.status).toBe(401);
  });

  it('login gagal dengan username tidak dikenal', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'siapa', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('login gagal kalau body tidak lengkap', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin' });
    expect(res.status).toBe(400);
  });

  it('login berhasil dan set-cookie session', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
    expect(res.headers['set-cookie']?.[0]).toContain('buku_sid=');
  });

  it('logout tanpa login ditolak 401', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('logout setelah login berhasil menghapus session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'password123' });

    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(204);

    const secondLogout = await agent.post('/api/auth/logout');
    expect(secondLogout.status).toBe(401);
  });
});
