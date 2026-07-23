import path from 'path';
import { Router, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/require-auth.js';
import { generateContent, type ContentBlok } from '../services/content-service.js';
import { renderChart, type ChartData } from '../services/chart-render-service.js';
import { renderDiagram, type DiagramData } from '../services/diagram-render-service.js';
import {
  TEXT_PROVIDERS,
  isTextProviderId,
  resolveProviderApiKey,
  type TextProviderCredentials,
} from '../services/ai-providers.js';

export interface BabDetailRow {
  id: number;
  buku_id: number;
  urutan: number;
  judul: string;
  ringkasan: string | null;
  status: string;
  created_at: string;
}

export interface BukuForBabRow {
  id: number;
  judul: string;
  mapel: string;
  jenjang: string;
  kurikulum: string | null;
}

export interface KontenBlokRow {
  id: number;
  bab_id: number;
  urutan: number;
  tipe: string;
  data_json: string;
  file_path: string | null;
  created_at: string;
}

export interface BabRoutesOptions {
  db: Database.Database;
  credentials: TextProviderCredentials;
  storageDir: string;
}

interface SavedBlok {
  id: number;
  urutan: number;
  tipe: string;
  data: unknown;
  file_path?: string | null;
}

/**
 * Render blok chart/diagram jadi PNG/SVG dan simpan file_path ke DB. Kegagalan render satu blok tidak
 * menggagalkan seluruh generate bab (teks/tabel tetap valid) — cukup dicatat ke stderr, file_path tetap null.
 */
async function renderVisualBlok(db: Database.Database, storageDir: string, blok: SavedBlok): Promise<void> {
  try {
    let filePath: string;
    if (blok.tipe === 'chart') {
      filePath = await renderChart(blok.data as ChartData, { outputDir: path.join(storageDir, 'chart') });
    } else if (blok.tipe === 'diagram') {
      filePath = await renderDiagram(blok.data as DiagramData, { outputDir: path.join(storageDir, 'diagram') });
    } else {
      return;
    }
    db.prepare('UPDATE konten_blok SET file_path = ? WHERE id = ?').run(filePath, blok.id);
    blok.file_path = filePath;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Gagal merender blok ${blok.tipe} (id=${blok.id}): ${message}`);
  }
}

function findBabOr404(db: Database.Database, idParam: string, res: Response): BabDetailRow | undefined {
  const id = Number(idParam);
  const bab = Number.isInteger(id)
    ? (db.prepare('SELECT * FROM bab WHERE id = ?').get(id) as BabDetailRow | undefined)
    : undefined;

  if (!bab) {
    res.status(404).json({ message: 'Bab tidak ditemukan.' });
    return undefined;
  }
  return bab;
}

function serializeBlokRow(row: KontenBlokRow): SavedBlok {
  return { id: row.id, urutan: row.urutan, tipe: row.tipe, data: JSON.parse(row.data_json), file_path: row.file_path };
}

export function babRoutes({ db, credentials, storageDir }: BabRoutesOptions): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/:id', (req, res) => {
    const bab = findBabOr404(db, req.params.id, res);
    if (!bab) {
      return;
    }

    const blokRows = db
      .prepare('SELECT * FROM konten_blok WHERE bab_id = ? ORDER BY urutan')
      .all(bab.id) as KontenBlokRow[];
    res.json({ ...bab, blok: blokRows.map(serializeBlokRow) });
  });

  router.post('/:id/generate', async (req, res) => {
    const bab = findBabOr404(db, req.params.id, res);
    if (!bab) {
      return;
    }

    const buku = db.prepare('SELECT id, judul, mapel, jenjang, kurikulum FROM buku WHERE id = ?').get(bab.buku_id) as
      BukuForBabRow | undefined;
    if (!buku) {
      res.status(404).json({ message: 'Buku untuk bab ini tidak ditemukan.' });
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

    db.prepare("UPDATE bab SET status = 'generating' WHERE id = ?").run(bab.id);

    const abortController = new AbortController();
    let clientGone = false;
    // Sama seperti POST /api/buku/:id/outline/generate: hanya anggap disconnect asli kalau
    // socket benar-benar hancur, bukan sekadar half-close saat client selesai kirim body JSON.
    const onDisconnect = (): void => {
      if (!res.writableEnded && (req.socket?.destroyed ?? false)) {
        clientGone = true;
        abortController.abort();
      }
    };
    req.on('close', onDisconnect);

    try {
      const result = await generateContent(
        {
          judulBuku: buku.judul,
          mapel: buku.mapel,
          jenjang: buku.jenjang,
          kurikulum: buku.kurikulum ?? undefined,
          judulBab: bab.judul,
          ringkasanBab: bab.ringkasan ?? undefined,
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

      const saveBlok = db.transaction((blokList: ContentBlok[]) => {
        db.prepare('DELETE FROM konten_blok WHERE bab_id = ?').run(bab.id);
        const insert = db.prepare('INSERT INTO konten_blok (bab_id, urutan, tipe, data_json) VALUES (?, ?, ?, ?)');
        return blokList.map((b, idx) => {
          const info = insert.run(bab.id, idx + 1, b.tipe, JSON.stringify(b.data));
          return { id: Number(info.lastInsertRowid), urutan: idx + 1, tipe: b.tipe, data: b.data };
        });
      });
      const savedBlok = saveBlok(result.blok);

      await Promise.all(savedBlok.map((blok) => renderVisualBlok(db, storageDir, blok)));

      db.prepare("UPDATE bab SET status = 'selesai' WHERE id = ?").run(bab.id);

      if (!clientGone && !res.writableEnded) {
        for (const blok of savedBlok) {
          res.write(`data: ${JSON.stringify({ blok })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ done: true, blok: savedBlok })}\n\n`);
      }
    } catch (err) {
      db.prepare("UPDATE bab SET status = 'error' WHERE id = ?").run(bab.id);
      if (!clientGone && !res.writableEnded) {
        const message = err instanceof Error ? err.message : 'Gagal generate konten bab.';
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      }
    } finally {
      req.off('close', onDisconnect);
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  return router;
}
