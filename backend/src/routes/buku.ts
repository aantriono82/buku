import { Router, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/require-auth.js';
import { generateOutline } from '../services/outline-service.js';
import {
  TEXT_PROVIDERS,
  isTextProviderId,
  resolveProviderApiKey,
  type TextProviderCredentials,
} from '../services/ai-providers.js';

export interface BukuRow {
  id: number;
  judul: string;
  mapel: string;
  jenjang: string;
  kurikulum: string | null;
  status: string;
  channel_created: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface BabRow {
  id: number;
  buku_id: number;
  urutan: number;
  judul: string;
  ringkasan: string | null;
  status: string;
  created_at: string;
}

export interface BukuRoutesOptions {
  db: Database.Database;
  credentials: TextProviderCredentials;
}

function findBukuOr404(db: Database.Database, idParam: string, res: Response): BukuRow | undefined {
  const id = Number(idParam);
  const buku = Number.isInteger(id)
    ? (db.prepare('SELECT * FROM buku WHERE id = ?').get(id) as BukuRow | undefined)
    : undefined;

  if (!buku) {
    res.status(404).json({ message: 'Buku tidak ditemukan.' });
    return undefined;
  }
  return buku;
}

export function bukuRoutes({ db, credentials }: BukuRoutesOptions): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/', (req, res) => {
    const { judul, mapel, jenjang, kurikulum } = req.body as {
      judul?: string;
      mapel?: string;
      jenjang?: string;
      kurikulum?: string;
    };

    if (!judul?.trim() || !mapel?.trim() || !jenjang?.trim()) {
      res.status(400).json({ message: 'Judul, mapel, dan jenjang wajib diisi.' });
      return;
    }

    const info = db
      .prepare('INSERT INTO buku (judul, mapel, jenjang, kurikulum, channel_created) VALUES (?, ?, ?, ?, ?)')
      .run(judul.trim(), mapel.trim(), jenjang.trim(), kurikulum?.trim() || null, 'web');

    const buku = db.prepare('SELECT * FROM buku WHERE id = ?').get(info.lastInsertRowid) as BukuRow;
    res.status(201).json(buku);
  });

  router.get('/', (_req, res) => {
    const rows = db.prepare('SELECT * FROM buku ORDER BY created_at DESC').all() as BukuRow[];
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const buku = findBukuOr404(db, req.params.id, res);
    if (!buku) {
      return;
    }

    const bab = db.prepare('SELECT * FROM bab WHERE buku_id = ? ORDER BY urutan').all(buku.id) as BabRow[];
    res.json({ ...buku, bab });
  });

  router.post('/:id/outline/generate', async (req, res) => {
    const buku = findBukuOr404(db, req.params.id, res);
    if (!buku) {
      return;
    }

    const { provider, model } = req.body as { provider?: string; model?: string };
    if (!provider || !isTextProviderId(provider)) {
      res.status(400).json({ message: 'Provider AI tidak valid atau belum dipilih.' });
      return;
    }

    const providerInfo = TEXT_PROVIDERS.find((p) => p.id === provider)!;
    const apiKey = resolveProviderApiKey(provider, credentials);
    if (!apiKey) {
      res.status(400).json({
        message: `${providerInfo.label} belum dikonfigurasi di server (env ${providerInfo.envKey} kosong).`,
      });
      return;
    }

    const chosenModel = model?.trim() || providerInfo.defaultModel;
    if (!chosenModel) {
      res.status(400).json({ message: 'Model wajib diisi untuk provider ini.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abortController = new AbortController();
    let clientGone = false;
    // Cek socket benar-benar hancur, bukan sekadar half-close (client selesai kirim body
    // request tapi koneksi response masih hidup) — kalau tidak, 'close' bisa terpicu sesaat
    // setelah body JSON request selesai dikirim, jauh sebelum stream AI selesai.
    const onDisconnect = (): void => {
      if (!res.writableEnded && (req.socket?.destroyed ?? false)) {
        clientGone = true;
        abortController.abort();
      }
    };
    req.on('close', onDisconnect);

    try {
      const result = await generateOutline(
        {
          judul: buku.judul,
          mapel: buku.mapel,
          jenjang: buku.jenjang,
          kurikulum: buku.kurikulum ?? undefined,
        },
        {
          provider,
          model: chosenModel,
          apiKey,
          signal: abortController.signal,
          onChunk: (chunk) => {
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
            }
          },
        },
      );

      if (!clientGone && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true, bab: result.bab })}\n\n`);
      }
    } catch (err) {
      if (!clientGone && !res.writableEnded) {
        const message = err instanceof Error ? err.message : 'Gagal generate outline.';
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      }
    } finally {
      req.off('close', onDisconnect);
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  router.put('/:id/outline', (req, res) => {
    const buku = findBukuOr404(db, req.params.id, res);
    if (!buku) {
      return;
    }

    const { bab } = req.body as { bab?: Array<{ judul?: string; ringkasan?: string }> };
    if (!Array.isArray(bab) || bab.length === 0) {
      res.status(400).json({ message: 'Outline harus berisi minimal 1 bab.' });
      return;
    }
    for (const b of bab) {
      if (!b.judul?.trim()) {
        res.status(400).json({ message: 'Setiap bab wajib punya judul.' });
        return;
      }
    }

    const saveOutline = db.transaction(() => {
      db.prepare('DELETE FROM bab WHERE buku_id = ?').run(buku.id);
      const insert = db.prepare('INSERT INTO bab (buku_id, urutan, judul, ringkasan) VALUES (?, ?, ?, ?)');
      bab.forEach((b, idx) => {
        insert.run(buku.id, idx + 1, b.judul!.trim(), b.ringkasan?.trim() || null);
      });
      db.prepare("UPDATE buku SET status = 'outline_ready', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(buku.id);
    });

    saveOutline();

    const savedBab = db.prepare('SELECT * FROM bab WHERE buku_id = ? ORDER BY urutan').all(buku.id) as BabRow[];
    res.json({ bab: savedBab });
  });

  return router;
}
