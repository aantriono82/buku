import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import request from 'supertest';

vi.mock('../../services/content-service.js', () => ({
  generateContent: vi.fn(),
}));
vi.mock('../../services/chart-render-service.js', () => ({
  renderChart: vi.fn(),
}));
vi.mock('../../services/diagram-render-service.js', () => ({
  renderDiagram: vi.fn(),
}));

import { generateContent } from '../../services/content-service.js';
import { renderChart } from '../../services/chart-render-service.js';
import { renderDiagram } from '../../services/diagram-render-service.js';
import { initDb, closeDb } from '../../db/connection.js';
import { seedAdminIfMissing } from '../../db/seed-admin.js';
import { createApp } from '../../app.js';
import { clearSessionsForTest } from '../../lib/session-store.js';
import { DEFAULT_TEXT_PROVIDER_CREDENTIALS, type TextProviderCredentials } from '../../services/ai-providers.js';

const mockedGenerateContent = vi.mocked(generateContent);
const mockedRenderChart = vi.mocked(renderChart);
const mockedRenderDiagram = vi.mocked(renderDiagram);

const credentialsWithOpenRouter: TextProviderCredentials = {
  ...DEFAULT_TEXT_PROVIDER_CREDENTIALS,
  OPENROUTER_API_KEY: 'test-api-key',
};

describe('bab routes', () => {
  let app: Express;
  let db: Database.Database;
  let agent: ReturnType<typeof request.agent>;

  async function createBukuWithBab(): Promise<{ bukuId: number; babId: number }> {
    const buku = await agent.post('/api/buku').send({ judul: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7' });
    const outline = await agent
      .put(`/api/buku/${buku.body.id}/outline`)
      .send({ bab: [{ judul: 'Bab 1', ringkasan: 'Ringkasan bab 1' }] });
    return { bukuId: buku.body.id, babId: outline.body.bab[0].id };
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
      credentials: credentialsWithOpenRouter,
      storageDir: './test-storage',
    });

    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'password123' });
  });

  afterEach(() => {
    closeDb();
  });

  describe('GET /api/bab/:id', () => {
    it('ditolak 401 kalau belum login', async () => {
      const res = await request(app).get('/api/bab/1');
      expect(res.status).toBe(401);
    });

    it('404 kalau bab tidak ada', async () => {
      const res = await agent.get('/api/bab/999');
      expect(res.status).toBe(404);
    });

    it('mengembalikan bab beserta blok (kosong sebelum digenerate)', async () => {
      const { babId } = await createBukuWithBab();

      const res = await agent.get(`/api/bab/${babId}`);
      expect(res.status).toBe(200);
      expect(res.body.judul).toBe('Bab 1');
      expect(res.body.status).toBe('belum');
      expect(res.body.blok).toEqual([]);
    });
  });

  describe('POST /api/bab/:id/generate (SSE)', () => {
    it('404 kalau bab tidak ada', async () => {
      const res = await agent.post('/api/bab/999/generate').send({ provider: 'openrouter' });
      expect(res.status).toBe(404);
    });

    it('400 kalau provider tidak dikirim atau tidak dikenal', async () => {
      const { babId } = await createBukuWithBab();

      const resKosong = await agent.post(`/api/bab/${babId}/generate`).send({});
      expect(resKosong.status).toBe(400);

      const resTidakDikenal = await agent.post(`/api/bab/${babId}/generate`).send({ provider: 'bukan-provider' });
      expect(resTidakDikenal.status).toBe(400);
    });

    it('400 kalau provider yang dipilih belum dikonfigurasi (env key kosong) di server', async () => {
      const appNoKey = createApp({
        db,
        frontendUrl: 'http://localhost:5183',
        isProduction: false,
        credentials: DEFAULT_TEXT_PROVIDER_CREDENTIALS,
        storageDir: './test-storage',
      });
      const { babId } = await createBukuWithBab();

      const agentNoKey = request.agent(appNoKey);
      await agentNoKey.post('/api/auth/login').send({ username: 'admin', password: 'password123' });

      const res = await agentNoKey.post(`/api/bab/${babId}/generate`).send({ provider: 'openrouter' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('OPENROUTER_API_KEY');
    });

    it('men-stream chunk lalu blok & done, menyimpan blok ke DB dan set status bab selesai', async () => {
      mockedGenerateContent.mockImplementation(async (_params, options) => {
        options.onChunk?.('menulis ');
        options.onChunk?.('bab');
        const blok = [
          { tipe: 'teks' as const, data: { markdown: 'Isi teks bab.' } },
          { tipe: 'tabel' as const, data: { headers: ['A', 'B'], rows: [['1', '2']] } },
        ];
        return { blok, rawResponse: JSON.stringify({ blok }) };
      });

      const { babId } = await createBukuWithBab();

      const res = await agent.post(`/api/bab/${babId}/generate`).send({ provider: 'openrouter' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('"chunk":"menulis "');
      expect(res.text).toContain('"chunk":"bab"');
      expect(res.text).toContain('Isi teks bab.');
      expect(res.text).toContain('"done":true');

      expect(mockedGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ judulBuku: 'Buku A', mapel: 'IPA', jenjang: 'SMP Kelas 7', judulBab: 'Bab 1' }),
        expect.objectContaining({ provider: 'openrouter', apiKey: 'test-api-key', model: 'deepseek/deepseek-chat' }),
      );

      const detail = await agent.get(`/api/bab/${babId}`);
      expect(detail.body.status).toBe('selesai');
      expect(detail.body.blok).toHaveLength(2);
      expect(detail.body.blok[0]).toMatchObject({ urutan: 1, tipe: 'teks', data: { markdown: 'Isi teks bab.' } });
      expect(detail.body.blok[1]).toMatchObject({ urutan: 2, tipe: 'tabel' });
    });

    it('menimpa (replace) blok lama saat digenerate ulang', async () => {
      mockedGenerateContent.mockResolvedValue({
        blok: [{ tipe: 'teks', data: { markdown: 'Versi lama' } }],
        rawResponse: '{}',
      });
      const { babId } = await createBukuWithBab();
      await agent.post(`/api/bab/${babId}/generate`).send({ provider: 'openrouter' });

      mockedGenerateContent.mockResolvedValue({
        blok: [
          { tipe: 'teks', data: { markdown: 'Versi baru 1' } },
          { tipe: 'teks', data: { markdown: 'Versi baru 2' } },
        ],
        rawResponse: '{}',
      });
      await agent.post(`/api/bab/${babId}/generate`).send({ provider: 'openrouter' });

      const detail = await agent.get(`/api/bab/${babId}`);
      expect(detail.body.blok).toHaveLength(2);
      expect(detail.body.blok.map((b: { data: { markdown: string } }) => b.data.markdown)).toEqual([
        'Versi baru 1',
        'Versi baru 2',
      ]);
    });

    it('merender blok chart & diagram lalu simpan file_path ke DB', async () => {
      mockedRenderChart.mockResolvedValue('/data/storage/chart/chart-1.png');
      mockedRenderDiagram.mockResolvedValue('/data/storage/diagram/diagram-1.svg');
      mockedGenerateContent.mockResolvedValue({
        blok: [
          {
            tipe: 'chart',
            data: { chart_type: 'bar', labels: ['A'], datasets: [{ label: 'Nilai', data: [1] }] },
          },
          { tipe: 'diagram', data: { mermaid_syntax: 'flowchart TD\nA-->B' } },
        ],
        rawResponse: '{}',
      });

      const { babId } = await createBukuWithBab();
      const res = await agent.post(`/api/bab/${babId}/generate`).send({ provider: 'openrouter' });

      expect(res.status).toBe(200);
      expect(mockedRenderChart).toHaveBeenCalledTimes(1);
      expect(mockedRenderDiagram).toHaveBeenCalledTimes(1);
      expect(res.text).toContain('/data/storage/chart/chart-1.png');
      expect(res.text).toContain('/data/storage/diagram/diagram-1.svg');

      const detail = await agent.get(`/api/bab/${babId}`);
      expect(detail.body.blok[0]).toMatchObject({ tipe: 'chart', file_path: '/data/storage/chart/chart-1.png' });
      expect(detail.body.blok[1]).toMatchObject({ tipe: 'diagram', file_path: '/data/storage/diagram/diagram-1.svg' });
    });

    it('kegagalan render chart tidak menggagalkan seluruh generate bab (blok lain tetap tersimpan)', async () => {
      mockedRenderChart.mockRejectedValue(new Error('canvas gagal'));
      mockedGenerateContent.mockResolvedValue({
        blok: [
          { tipe: 'teks', data: { markdown: 'Isi teks' } },
          {
            tipe: 'chart',
            data: { chart_type: 'bar', labels: ['A'], datasets: [{ label: 'Nilai', data: [1] }] },
          },
        ],
        rawResponse: '{}',
      });

      const { babId } = await createBukuWithBab();
      const res = await agent.post(`/api/bab/${babId}/generate`).send({ provider: 'openrouter' });

      expect(res.status).toBe(200);
      expect(res.text).toContain('"done":true');

      const detail = await agent.get(`/api/bab/${babId}`);
      expect(detail.body.status).toBe('selesai');
      expect(detail.body.blok).toHaveLength(2);
      expect(detail.body.blok[1]).toMatchObject({ tipe: 'chart', file_path: null });
    });

    it('mengirim event error dan set status bab error kalau generateContent gagal', async () => {
      mockedGenerateContent.mockRejectedValue(new Error('DeepSeek API error (401): unauthorized'));

      const { babId } = await createBukuWithBab();
      const res = await agent.post(`/api/bab/${babId}/generate`).send({ provider: 'openrouter' });

      expect(res.status).toBe(200);
      expect(res.text).toContain('"error"');
      expect(res.text).toContain('DeepSeek API error (401)');

      const detail = await agent.get(`/api/bab/${babId}`);
      expect(detail.body.status).toBe('error');
    });
  });
});
