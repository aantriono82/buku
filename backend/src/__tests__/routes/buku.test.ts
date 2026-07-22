import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import request from 'supertest';

vi.mock('../../services/outline-service.js', () => ({
  generateOutline: vi.fn(),
}));

import { generateOutline } from '../../services/outline-service.js';
import { initDb, closeDb } from '../../db/connection.js';
import { seedAdminIfMissing } from '../../db/seed-admin.js';
import { createApp } from '../../app.js';
import { clearSessionsForTest } from '../../lib/session-store.js';
import { DEFAULT_TEXT_PROVIDER_CREDENTIALS, type TextProviderCredentials } from '../../services/ai-providers.js';

const mockedGenerateOutline = vi.mocked(generateOutline);

const credentialsWithOpenRouter: TextProviderCredentials = {
  ...DEFAULT_TEXT_PROVIDER_CREDENTIALS,
  OPENROUTER_API_KEY: 'test-api-key',
};

describe('buku routes', () => {
  let app: Express;
  let db: Database.Database;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    vi.clearAllMocks();
    clearSessionsForTest();
    db = initDb(':memory:');
    seedAdminIfMissing(db, 'admin', 'password123');
    app = createApp({
      db,
      frontendUrl: 'http://localhost:5183',
      isProduction: false,
      credentials: credentialsWithOpenRouter,
    });

    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'password123' });
  });

  afterEach(() => {
    closeDb();
  });

  describe('POST /api/buku', () => {
    it('ditolak 401 kalau belum login', async () => {
      const res = await request(app).post('/api/buku').send({ judul: 'X', mapel: 'Y', jenjang: 'Z' });
      expect(res.status).toBe(401);
    });

    it('ditolak 400 kalau field wajib kosong', async () => {
      const res = await agent.post('/api/buku').send({ judul: 'Matematika Dasar' });
      expect(res.status).toBe(400);
    });

    it('berhasil membuat buku baru dengan status draft', async () => {
      const res = await agent
        .post('/api/buku')
        .send({ judul: 'Matematika Dasar', mapel: 'Matematika', jenjang: 'SD Kelas 4', kurikulum: 'Merdeka' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        judul: 'Matematika Dasar',
        mapel: 'Matematika',
        jenjang: 'SD Kelas 4',
        kurikulum: 'Merdeka',
        status: 'draft',
        channel_created: 'web',
      });
      expect(res.body.id).toBeTypeOf('number');
    });
  });

  describe('GET /api/buku dan /api/buku/:id', () => {
    it('list mengembalikan buku yang sudah dibuat', async () => {
      await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });

      const res = await agent.get('/api/buku');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].judul).toBe('Buku A');
    });

    it('detail 404 kalau buku tidak ada', async () => {
      const res = await agent.get('/api/buku/999');
      expect(res.status).toBe(404);
    });

    it('detail mengembalikan buku beserta bab (kosong di awal)', async () => {
      const created = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });

      const res = await agent.get(`/api/buku/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.judul).toBe('Buku A');
      expect(res.body.bab).toEqual([]);
    });
  });

  describe('POST /api/buku/:id/outline/generate (SSE)', () => {
    it('404 kalau buku tidak ada', async () => {
      const res = await agent.post('/api/buku/999/outline/generate').send({ provider: 'openrouter' });
      expect(res.status).toBe(404);
    });

    it('400 kalau provider tidak dikirim atau tidak dikenal', async () => {
      const created = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });

      const resKosong = await agent.post(`/api/buku/${created.body.id}/outline/generate`).send({});
      expect(resKosong.status).toBe(400);

      const resTidakDikenal = await agent
        .post(`/api/buku/${created.body.id}/outline/generate`)
        .send({ provider: 'bukan-provider' });
      expect(resTidakDikenal.status).toBe(400);
    });

    it('400 kalau provider yang dipilih belum dikonfigurasi (env key kosong) di server', async () => {
      const appNoKey = createApp({
        db,
        frontendUrl: 'http://localhost:5183',
        isProduction: false,
        credentials: DEFAULT_TEXT_PROVIDER_CREDENTIALS,
      });
      const created = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });

      // Session store bersifat global (bukan per-instance app), jadi agent yang sudah login
      // bisa dipakai langsung ke instance app lain yang berbagi db yang sama.
      const agentNoKey = request.agent(appNoKey);
      await agentNoKey.post('/api/auth/login').send({ username: 'admin', password: 'password123' });

      const res = await agentNoKey
        .post(`/api/buku/${created.body.id}/outline/generate`)
        .send({ provider: 'openrouter' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('OPENROUTER_API_KEY');
    });

    it('men-stream chunk lalu event done berisi bab hasil generate, model default dipakai kalau tidak diisi', async () => {
      mockedGenerateOutline.mockImplementation(async (_params, options) => {
        options.onChunk?.('halo ');
        options.onChunk?.('dunia');
        const bab = [
          { judul: 'Bab 1', ringkasan: 'Ringkasan 1' },
          { judul: 'Bab 2', ringkasan: 'Ringkasan 2' },
        ];
        return { bab, rawResponse: JSON.stringify({ bab }) };
      });

      const created = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });

      const res = await agent.post(`/api/buku/${created.body.id}/outline/generate`).send({ provider: 'openrouter' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('"chunk":"halo "');
      expect(res.text).toContain('"chunk":"dunia"');
      expect(res.text).toContain('"done":true');
      expect(res.text).toContain('Bab 1');
      expect(mockedGenerateOutline).toHaveBeenCalledWith(
        expect.objectContaining({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' }),
        expect.objectContaining({ provider: 'openrouter', apiKey: 'test-api-key', model: 'deepseek/deepseek-chat' }),
      );
    });

    it('memakai model custom dari body kalau diisi', async () => {
      mockedGenerateOutline.mockResolvedValue({ bab: [{ judul: 'Bab 1', ringkasan: '' }], rawResponse: '{}' });

      const created = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });
      await agent
        .post(`/api/buku/${created.body.id}/outline/generate`)
        .send({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' });

      expect(mockedGenerateOutline).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ model: 'deepseek/deepseek-v4-flash' }),
      );
    });

    it('mengirim event error kalau generateOutline gagal', async () => {
      mockedGenerateOutline.mockRejectedValue(new Error('OpenRouter API error (401): unauthorized'));

      const created = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });

      const res = await agent.post(`/api/buku/${created.body.id}/outline/generate`).send({ provider: 'openrouter' });

      expect(res.status).toBe(200);
      expect(res.text).toContain('"error"');
      expect(res.text).toContain('OpenRouter API error (401)');
    });
  });

  describe('PUT /api/buku/:id/outline', () => {
    it('400 kalau bab kosong', async () => {
      const created = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });
      const res = await agent.put(`/api/buku/${created.body.id}/outline`).send({ bab: [] });
      expect(res.status).toBe(400);
    });

    it('400 kalau ada bab tanpa judul', async () => {
      const created = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });
      const res = await agent
        .put(`/api/buku/${created.body.id}/outline`)
        .send({ bab: [{ judul: 'Bab 1' }, { ringkasan: 'tanpa judul' }] });
      expect(res.status).toBe(400);
    });

    it('menyimpan bab ke database dan mengubah status buku jadi outline_ready', async () => {
      const created = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });

      const res = await agent.put(`/api/buku/${created.body.id}/outline`).send({
        bab: [
          { judul: 'Bab 1', ringkasan: 'Ringkasan 1' },
          { judul: 'Bab 2', ringkasan: 'Ringkasan 2' },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.bab).toHaveLength(2);
      expect(res.body.bab[0]).toMatchObject({ urutan: 1, judul: 'Bab 1', status: 'belum' });
      expect(res.body.bab[1]).toMatchObject({ urutan: 2, judul: 'Bab 2' });

      const detail = await agent.get(`/api/buku/${created.body.id}`);
      expect(detail.body.status).toBe('outline_ready');
      expect(detail.body.bab).toHaveLength(2);
    });

    it('menimpa (replace) outline lama saat disimpan ulang', async () => {
      const created = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });
      await agent.put(`/api/buku/${created.body.id}/outline`).send({ bab: [{ judul: 'Bab Lama', ringkasan: '' }] });

      const res = await agent.put(`/api/buku/${created.body.id}/outline`).send({
        bab: [
          { judul: 'Bab Baru 1', ringkasan: '' },
          { judul: 'Bab Baru 2', ringkasan: '' },
        ],
      });

      expect(res.body.bab).toHaveLength(2);
      expect(res.body.bab.map((b: { judul: string }) => b.judul)).toEqual(['Bab Baru 1', 'Bab Baru 2']);
    });
  });
});
