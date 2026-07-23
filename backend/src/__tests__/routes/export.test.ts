import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import request from 'supertest';

vi.mock('../../services/export-service.js', () => ({
  buildDocx: vi.fn(),
  convertDocxToPdf: vi.fn(),
}));

import { buildDocx, convertDocxToPdf } from '../../services/export-service.js';
import { initDb, closeDb } from '../../db/connection.js';
import { seedAdminIfMissing } from '../../db/seed-admin.js';
import { createApp } from '../../app.js';
import { clearSessionsForTest } from '../../lib/session-store.js';
import { DEFAULT_TEXT_PROVIDER_CREDENTIALS } from '../../services/ai-providers.js';

const mockedBuildDocx = vi.mocked(buildDocx);
const mockedConvertDocxToPdf = vi.mocked(convertDocxToPdf);

describe('export routes', () => {
  let app: Express;
  let db: Database.Database;
  let agent: ReturnType<typeof request.agent>;
  let storageDir: string;

  async function createBukuSelesai(): Promise<number> {
    const buku = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });
    const outline = await agent
      .put(`/api/buku/${buku.body.id}/outline`)
      .send({ bab: [{ judul: 'Bab 1', ringkasan: 'r' }] });
    const babId = outline.body.bab[0].id as number;
    db.prepare("UPDATE bab SET status = 'selesai' WHERE id = ?").run(babId);
    return buku.body.id as number;
  }

  async function waitForJobDone(jobId: number): Promise<request.Response> {
    for (let i = 0; i < 50; i++) {
      const res = await agent.get(`/api/export/${jobId}`);
      if (res.body.status === 'selesai' || res.body.status === 'error') {
        return res;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Timeout menunggu job export selesai.');
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    clearSessionsForTest();
    db = initDb(':memory:');
    seedAdminIfMissing(db, 'admin', 'password123');
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'export-routes-test-'));

    app = createApp({
      db,
      frontendUrl: 'http://localhost:5183',
      isProduction: false,
      credentials: DEFAULT_TEXT_PROVIDER_CREDENTIALS,
      storageDir,
    });

    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'password123' });
  });

  afterEach(async () => {
    closeDb();
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  describe('POST /api/buku/:id/export', () => {
    it('ditolak 401 kalau belum login', async () => {
      const res = await request(app).post('/api/buku/1/export').send({ format: 'docx' });
      expect(res.status).toBe(401);
    });

    it('404 kalau buku tidak ada', async () => {
      const res = await agent.post('/api/buku/999/export').send({ format: 'docx' });
      expect(res.status).toBe(404);
    });

    it('400 kalau format bukan docx/pdf', async () => {
      const bukuId = await createBukuSelesai();
      const res = await agent.post(`/api/buku/${bukuId}/export`).send({ format: 'epub' });
      expect(res.status).toBe(400);
    });

    it('400 kalau buku belum punya bab', async () => {
      const buku = await agent.post('/api/buku').send({ judul: 'Buku Kosong', mapel: 'IPA', jenjang: 'SD' });
      const res = await agent.post(`/api/buku/${buku.body.id}/export`).send({ format: 'docx' });
      expect(res.status).toBe(400);
    });

    it('400 kalau ada bab yang belum berstatus selesai', async () => {
      const buku = await agent.post('/api/buku').send({ judul: 'Buku B', mapel: 'IPA', jenjang: 'SD' });
      await agent.put(`/api/buku/${buku.body.id}/outline`).send({ bab: [{ judul: 'Bab 1' }] });

      const res = await agent.post(`/api/buku/${buku.body.id}/export`).send({ format: 'docx' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/selesai/);
    });

    it('202 + job selesai dengan format docx (tidak memanggil convertDocxToPdf)', async () => {
      mockedBuildDocx.mockResolvedValue(Buffer.from('dummy-docx'));
      const bukuId = await createBukuSelesai();

      const created = await agent.post(`/api/buku/${bukuId}/export`).send({ format: 'docx' });
      expect(created.status).toBe(202);
      expect(created.body.status).toBe('pending');

      const done = await waitForJobDone(created.body.id);
      expect(done.body.status).toBe('selesai');
      expect(done.body.download_url).toBe(`/api/export/${created.body.id}/download`);
      expect(mockedBuildDocx).toHaveBeenCalledTimes(1);
      expect(mockedConvertDocxToPdf).not.toHaveBeenCalled();

      const files = await fs.readdir(path.join(storageDir, 'export'));
      expect(files).toContain(`buku-${bukuId}-job${created.body.id}.docx`);
    });

    it('202 + job selesai dengan format pdf (memanggil convertDocxToPdf)', async () => {
      mockedBuildDocx.mockResolvedValue(Buffer.from('dummy-docx'));
      mockedConvertDocxToPdf.mockImplementation(async (_docxPath, options) => {
        const pdfPath = path.join(options.outputDir, 'hasil.pdf');
        await fs.writeFile(pdfPath, 'dummy-pdf');
        return pdfPath;
      });
      const bukuId = await createBukuSelesai();

      const created = await agent.post(`/api/buku/${bukuId}/export`).send({ format: 'pdf' });
      const done = await waitForJobDone(created.body.id);

      expect(done.body.status).toBe('selesai');
      expect(mockedConvertDocxToPdf).toHaveBeenCalledTimes(1);
    });

    it('job berstatus error kalau buildDocx gagal, error_message terisi', async () => {
      mockedBuildDocx.mockRejectedValue(new Error('AI gagal, dummy'));
      const bukuId = await createBukuSelesai();

      const created = await agent.post(`/api/buku/${bukuId}/export`).send({ format: 'docx' });
      const done = await waitForJobDone(created.body.id);

      expect(done.body.status).toBe('error');
      expect(done.body.error_message).toMatch(/AI gagal, dummy/);
    });
  });

  describe('GET /api/export/:jobId', () => {
    it('ditolak 401 kalau belum login', async () => {
      const res = await request(app).get('/api/export/1');
      expect(res.status).toBe(401);
    });

    it('404 kalau job tidak ada', async () => {
      const res = await agent.get('/api/export/999');
      expect(res.status).toBe(404);
    });

    it('download_url null selama belum selesai', async () => {
      mockedBuildDocx.mockImplementation(() => new Promise(() => {})); // sengaja tidak pernah resolve
      const bukuId = await createBukuSelesai();
      const created = await agent.post(`/api/buku/${bukuId}/export`).send({ format: 'docx' });

      const res = await agent.get(`/api/export/${created.body.id}`);
      expect(['pending', 'processing']).toContain(res.body.status);
      expect(res.body.download_url).toBeNull();
    });
  });

  describe('GET /api/export/:jobId/download', () => {
    it('ditolak 401 kalau belum login', async () => {
      const res = await request(app).get('/api/export/1/download');
      expect(res.status).toBe(401);
    });

    it('404 kalau job tidak ada', async () => {
      const res = await agent.get('/api/export/999/download');
      expect(res.status).toBe(404);
    });

    it('400 kalau job belum selesai', async () => {
      mockedBuildDocx.mockImplementation(() => new Promise(() => {}));
      const bukuId = await createBukuSelesai();
      const created = await agent.post(`/api/buku/${bukuId}/export`).send({ format: 'docx' });

      const res = await agent.get(`/api/export/${created.body.id}/download`);
      expect(res.status).toBe(400);
    });

    it('200 dan mengirim file saat job sudah selesai', async () => {
      mockedBuildDocx.mockResolvedValue(Buffer.from('isi-docx-asli'));
      const bukuId = await createBukuSelesai();
      const created = await agent.post(`/api/buku/${bukuId}/export`).send({ format: 'docx' });
      await waitForJobDone(created.body.id);

      const res = await agent.get(`/api/export/${created.body.id}/download`);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/\.docx/);
      expect(res.text).toBe('isi-docx-asli');
    });
  });
});
