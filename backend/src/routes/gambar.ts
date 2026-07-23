import path from 'path';
import { Router, type Response } from 'express';
import multer from 'multer';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/require-auth.js';
import { generateAI, saveUpload, type ImageProvider } from '../services/image-service.js';
import { toFileUrl } from './bab.js';
import type { GambarData } from '../services/content-service.js';

export interface GambarBlokRow {
  id: number;
  bab_id: number;
  urutan: number;
  tipe: string;
  data_json: string;
  file_path: string | null;
}

export interface GambarRoutesOptions {
  db: Database.Database;
  storageDir: string;
  imageProvider?: ImageProvider;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      cb(new Error('Format gambar harus PNG, JPG, atau WEBP.'));
      return;
    }
    cb(null, true);
  },
});

function findGambarBlokOr404(db: Database.Database, idParam: string, res: Response): GambarBlokRow | undefined {
  const id = Number(idParam);
  const blok = Number.isInteger(id)
    ? (db.prepare('SELECT * FROM konten_blok WHERE id = ?').get(id) as GambarBlokRow | undefined)
    : undefined;

  if (!blok) {
    res.status(404).json({ message: 'Blok tidak ditemukan.' });
    return undefined;
  }
  if (blok.tipe !== 'gambar') {
    res.status(400).json({ message: 'Blok ini bukan blok gambar.' });
    return undefined;
  }
  return blok;
}

export function gambarRoutes({ db, storageDir, imageProvider }: GambarRoutesOptions): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/:id/gambar/upload', (req, res) => {
    upload.single('gambar')(req, res, (err: unknown) => {
      void (async () => {
        if (err) {
          res.status(400).json({ message: err instanceof Error ? err.message : 'Upload gagal.' });
          return;
        }

        const blok = findGambarBlokOr404(db, req.params.id, res);
        if (!blok) {
          return;
        }

        const file = req.file;
        if (!file) {
          res.status(400).json({ message: 'File gambar wajib diunggah (field "gambar").' });
          return;
        }

        try {
          const filePath = await saveUpload(
            { buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname },
            { outputDir: path.join(storageDir, 'gambar') },
          );

          const existingData = JSON.parse(blok.data_json) as Partial<GambarData>;
          const newData: GambarData = { ...existingData, source: 'upload' };
          db.prepare('UPDATE konten_blok SET data_json = ?, file_path = ? WHERE id = ?').run(
            JSON.stringify(newData),
            filePath,
            blok.id,
          );

          res.json({
            id: blok.id,
            tipe: 'gambar',
            data: newData,
            file_path: filePath,
            file_url: toFileUrl(storageDir, filePath),
          });
        } catch (uploadErr) {
          res.status(400).json({ message: uploadErr instanceof Error ? uploadErr.message : 'Gagal menyimpan gambar.' });
        }
      })();
    });
  });

  router.post('/:id/gambar/regenerate', async (req, res) => {
    const blok = findGambarBlokOr404(db, req.params.id, res);
    if (!blok) {
      return;
    }

    if (!imageProvider) {
      res.status(400).json({ message: 'Provider AI gambar belum dikonfigurasi di server.' });
      return;
    }

    const existingData = JSON.parse(blok.data_json) as Partial<GambarData>;
    const promptOverride = (req.body as { prompt?: string } | undefined)?.prompt;
    const prompt = promptOverride?.trim() || existingData.prompt?.trim();

    if (!prompt) {
      res.status(400).json({ message: 'Prompt gambar wajib diisi (belum ada prompt tersimpan untuk blok ini).' });
      return;
    }

    try {
      const filePath = await generateAI(imageProvider, prompt, { outputDir: path.join(storageDir, 'gambar') });
      const newData: GambarData = { ...existingData, source: 'ai', prompt };
      db.prepare('UPDATE konten_blok SET data_json = ?, file_path = ? WHERE id = ?').run(
        JSON.stringify(newData),
        filePath,
        blok.id,
      );

      res.json({
        id: blok.id,
        tipe: 'gambar',
        data: newData,
        file_path: filePath,
        file_url: toFileUrl(storageDir, filePath),
      });
    } catch (err) {
      res.status(502).json({ message: err instanceof Error ? err.message : 'Gagal generate gambar AI.' });
    }
  });

  return router;
}
