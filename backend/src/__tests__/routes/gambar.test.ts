import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import request from 'supertest';

vi.mock('../../services/image-service.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/image-service.js')>(
    '../../services/image-service.js',
  );
  return { ...actual, generateAI: vi.fn(), saveUpload: vi.fn() };
});

import { generateAI, saveUpload } from '../../services/image-service.js';
import { initDb, closeDb } from '../../db/connection.js';
import { seedAdminIfMissing } from '../../db/seed-admin.js';
import { createApp } from '../../app.js';
import { clearSessionsForTest } from '../../lib/session-store.js';
import { DEFAULT_TEXT_PROVIDER_CREDENTIALS } from '../../services/ai-providers.js';

const mockedGenerateAI = vi.mocked(generateAI);
const mockedSaveUpload = vi.mocked(saveUpload);

describe('gambar routes', () => {
  let app: Express;
  let db: Database.Database;
  let agent: ReturnType<typeof request.agent>;
  let babId: number;

  function insertGambarBlok(data: Record<string, unknown>): number {
    const info = db
      .prepare('INSERT INTO konten_blok (bab_id, urutan, tipe, data_json) VALUES (?, ?, ?, ?)')
      .run(babId, 1, 'gambar', JSON.stringify(data));
    return Number(info.lastInsertRowid);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    clearSessionsForTest();
    db = initDb(':memory:');
    seedAdminIfMissing(db, 'admin', 'password123');

    app = createApp({
      db,
      frontendUrl: 'http://localhost:5183',
      isProduction: false,
      credentials: DEFAULT_TEXT_PROVIDER_CREDENTIALS,
      storageDir: './test-storage',
      imageProvider: { generate: vi.fn() },
    });

    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'password123' });

    const buku = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });
    const outline = await agent
      .put(`/api/buku/${buku.body.id}/outline`)
      .send({ bab: [{ judul: 'Bab 1', ringkasan: 'r' }] });
    babId = outline.body.bab[0].id;
  });

  afterEach(() => {
    closeDb();
  });

  describe('POST /api/blok/:id/gambar/upload', () => {
    it('ditolak 401 kalau belum login', async () => {
      const blokId = insertGambarBlok({ source: 'upload' });
      const res = await request(app)
        .post(`/api/blok/${blokId}/gambar/upload`)
        .attach('gambar', Buffer.from('fake-png'), { filename: 'a.png', contentType: 'image/png' });
      expect(res.status).toBe(401);
    });

    it('404 kalau blok tidak ada', async () => {
      const res = await agent
        .post('/api/blok/999/gambar/upload')
        .attach('gambar', Buffer.from('fake-png'), { filename: 'a.png', contentType: 'image/png' });
      expect(res.status).toBe(404);
    });

    it('400 kalau blok bukan tipe gambar', async () => {
      const info = db
        .prepare('INSERT INTO konten_blok (bab_id, urutan, tipe, data_json) VALUES (?, ?, ?, ?)')
        .run(babId, 1, 'teks', JSON.stringify({ markdown: 'x' }));
      const blokId = Number(info.lastInsertRowid);

      const res = await agent
        .post(`/api/blok/${blokId}/gambar/upload`)
        .attach('gambar', Buffer.from('fake-png'), { filename: 'a.png', contentType: 'image/png' });
      expect(res.status).toBe(400);
    });

    it('400 kalau tidak ada file yang diunggah', async () => {
      const blokId = insertGambarBlok({ source: 'upload' });
      const res = await agent.post(`/api/blok/${blokId}/gambar/upload`);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('wajib diunggah');
    });

    it('400 kalau mime type file bukan gambar', async () => {
      const blokId = insertGambarBlok({ source: 'upload' });
      const res = await agent
        .post(`/api/blok/${blokId}/gambar/upload`)
        .attach('gambar', Buffer.from('bukan gambar'), { filename: 'a.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(400);
    });

    it('berhasil upload gambar, replace data_json jadi source upload, dan simpan file_path', async () => {
      mockedSaveUpload.mockResolvedValue('/data/storage/gambar/upload-1.png');
      const blokId = insertGambarBlok({ source: 'ai', prompt: 'ilustrasi lama' });

      const res = await agent
        .post(`/api/blok/${blokId}/gambar/upload`)
        .attach('gambar', Buffer.from('fake-png'), { filename: 'a.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.data.source).toBe('upload');
      expect(res.body.file_path).toBe('/data/storage/gambar/upload-1.png');
      expect(mockedSaveUpload).toHaveBeenCalledTimes(1);

      const row = db.prepare('SELECT * FROM konten_blok WHERE id = ?').get(blokId) as {
        data_json: string;
        file_path: string;
      };
      expect(JSON.parse(row.data_json)).toMatchObject({ source: 'upload' });
      expect(row.file_path).toBe('/data/storage/gambar/upload-1.png');
    });
  });

  describe('POST /api/blok/:id/gambar/regenerate', () => {
    it('ditolak 401 kalau belum login', async () => {
      const blokId = insertGambarBlok({ source: 'ai', prompt: 'x' });
      const res = await request(app).post(`/api/blok/${blokId}/gambar/regenerate`);
      expect(res.status).toBe(401);
    });

    it('404 kalau blok tidak ada', async () => {
      const res = await agent.post('/api/blok/999/gambar/regenerate');
      expect(res.status).toBe(404);
    });

    it('400 kalau imageProvider tidak dikonfigurasi', async () => {
      const appNoProvider = createApp({
        db,
        frontendUrl: 'http://localhost:5183',
        isProduction: false,
        credentials: DEFAULT_TEXT_PROVIDER_CREDENTIALS,
        storageDir: './test-storage',
      });
      const agentNoProvider = request.agent(appNoProvider);
      await agentNoProvider.post('/api/auth/login').send({ username: 'admin', password: 'password123' });

      const blokId = insertGambarBlok({ source: 'ai', prompt: 'ilustrasi' });
      const res = await agentNoProvider.post(`/api/blok/${blokId}/gambar/regenerate`);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('belum dikonfigurasi');
    });

    it('400 kalau tidak ada prompt tersimpan maupun dikirim', async () => {
      const blokId = insertGambarBlok({ source: 'upload' });
      const res = await agent.post(`/api/blok/${blokId}/gambar/regenerate`).send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Prompt gambar wajib diisi');
    });

    it('generate ulang pakai prompt tersimpan kalau tidak override', async () => {
      mockedGenerateAI.mockResolvedValue('/data/storage/gambar/gambar-2.png');
      const blokId = insertGambarBlok({ source: 'ai', prompt: 'ilustrasi lama', caption: 'lama' });

      const res = await agent.post(`/api/blok/${blokId}/gambar/regenerate`).send({});

      expect(res.status).toBe(200);
      expect(mockedGenerateAI).toHaveBeenCalledWith(
        expect.anything(),
        'ilustrasi lama',
        expect.objectContaining({ outputDir: expect.stringContaining('gambar') }),
      );
      expect(res.body.data).toMatchObject({ source: 'ai', prompt: 'ilustrasi lama', caption: 'lama' });
      expect(res.body.file_path).toBe('/data/storage/gambar/gambar-2.png');
    });

    it('generate ulang pakai prompt override dari body', async () => {
      mockedGenerateAI.mockResolvedValue('/data/storage/gambar/gambar-3.png');
      const blokId = insertGambarBlok({ source: 'upload' });

      const res = await agent.post(`/api/blok/${blokId}/gambar/regenerate`).send({ prompt: 'prompt baru' });

      expect(res.status).toBe(200);
      expect(mockedGenerateAI).toHaveBeenCalledWith(expect.anything(), 'prompt baru', expect.anything());
      expect(res.body.data).toMatchObject({ source: 'ai', prompt: 'prompt baru' });
    });

    it('502 kalau generateAI gagal', async () => {
      mockedGenerateAI.mockRejectedValue(new Error('Gemini Image API error (429): quota exceeded'));
      const blokId = insertGambarBlok({ source: 'ai', prompt: 'ilustrasi' });

      const res = await agent.post(`/api/blok/${blokId}/gambar/regenerate`).send({});
      expect(res.status).toBe(502);
      expect(res.body.message).toContain('quota exceeded');
    });
  });
});
