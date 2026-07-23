import path from 'path';
import { promises as fs } from 'fs';
import { Router, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/require-auth.js';
import {
  buildDocx,
  convertDocxToPdf,
  type BabForExport,
  type BlokForExport,
  type BukuForExport,
} from '../services/export-service.js';

export interface ExportRoutesOptions {
  db: Database.Database;
  storageDir: string;
}

interface BukuForExportRow {
  id: number;
  judul: string;
  mapel: string;
  jenjang: string;
  kurikulum: string | null;
}

interface BabWithStatusRow {
  id: number;
  urutan: number;
  judul: string;
  status: string;
}

interface KontenBlokExportRow {
  urutan: number;
  tipe: string;
  data_json: string;
  file_path: string | null;
}

export interface ExportJobRow {
  id: number;
  buku_id: number;
  format: string;
  status: string;
  file_path: string | null;
  error_message: string | null;
  created_at: string;
}

function findBukuOr404(db: Database.Database, idParam: string, res: Response): BukuForExportRow | undefined {
  const id = Number(idParam);
  const buku = Number.isInteger(id)
    ? (db.prepare('SELECT id, judul, mapel, jenjang, kurikulum FROM buku WHERE id = ?').get(id) as
        BukuForExportRow | undefined)
    : undefined;

  if (!buku) {
    res.status(404).json({ message: 'Buku tidak ditemukan.' });
    return undefined;
  }
  return buku;
}

function findJobOr404(db: Database.Database, idParam: string, res: Response): ExportJobRow | undefined {
  const id = Number(idParam);
  const job = Number.isInteger(id)
    ? (db.prepare('SELECT * FROM export_job WHERE id = ?').get(id) as ExportJobRow | undefined)
    : undefined;

  if (!job) {
    res.status(404).json({ message: 'Job export tidak ditemukan.' });
    return undefined;
  }
  return job;
}

/**
 * Jalan di background (tidak di-await oleh route handler) setelah export_job dibuat dengan status "pending".
 * Semua kegagalan (compile DOCX, konversi PDF) ditangkap di sini dan disimpan ke error_message — konsisten
 * dengan pola status tracking bab/blok: satu job gagal tidak memengaruhi job lain.
 */
async function runExportJob(db: Database.Database, storageDir: string, jobId: number): Promise<void> {
  db.prepare("UPDATE export_job SET status = 'processing' WHERE id = ?").run(jobId);

  try {
    const job = db.prepare('SELECT * FROM export_job WHERE id = ?').get(jobId) as ExportJobRow;
    const buku = db.prepare('SELECT id, judul, mapel, jenjang, kurikulum FROM buku WHERE id = ?').get(job.buku_id) as
      BukuForExportRow | undefined;
    if (!buku) {
      throw new Error('Buku untuk job export ini tidak ditemukan.');
    }

    const babRows = db
      .prepare('SELECT id, urutan, judul, status FROM bab WHERE buku_id = ? ORDER BY urutan')
      .all(buku.id) as BabWithStatusRow[];

    const babList: BabForExport[] = babRows.map((bab) => {
      const blokRows = db
        .prepare('SELECT urutan, tipe, data_json, file_path FROM konten_blok WHERE bab_id = ? ORDER BY urutan')
        .all(bab.id) as KontenBlokExportRow[];
      const blok: BlokForExport[] = blokRows.map((row) => ({
        tipe: row.tipe,
        data: JSON.parse(row.data_json) as unknown,
        file_path: row.file_path,
      }));
      return { urutan: bab.urutan, judul: bab.judul, blok };
    });

    const bukuExport: BukuForExport = {
      judul: buku.judul,
      mapel: buku.mapel,
      jenjang: buku.jenjang,
      kurikulum: buku.kurikulum,
    };
    const docxBuffer = await buildDocx(bukuExport, babList);

    const exportDir = path.join(storageDir, 'export');
    await fs.mkdir(exportDir, { recursive: true });
    const docxPath = path.join(exportDir, `buku-${buku.id}-job${jobId}.docx`);
    await fs.writeFile(docxPath, docxBuffer);

    const finalPath = job.format === 'pdf' ? await convertDocxToPdf(docxPath, { outputDir: exportDir }) : docxPath;

    db.prepare("UPDATE export_job SET status = 'selesai', file_path = ? WHERE id = ?").run(finalPath, jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal export buku.';
    db.prepare("UPDATE export_job SET status = 'error', error_message = ? WHERE id = ?").run(message, jobId);
  }
}

/** Mounted di /api/buku — hanya trigger export, status/download lewat exportJobRoutes. */
export function bukuExportRoutes({ db, storageDir }: ExportRoutesOptions): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/:id/export', (req, res) => {
    const buku = findBukuOr404(db, req.params.id, res);
    if (!buku) {
      return;
    }

    const { format } = req.body as { format?: string };
    if (format !== 'docx' && format !== 'pdf') {
      res.status(400).json({ message: 'Format export wajib "docx" atau "pdf".' });
      return;
    }

    const babRows = db.prepare('SELECT status FROM bab WHERE buku_id = ?').all(buku.id) as { status: string }[];
    if (babRows.length === 0) {
      res.status(400).json({ message: 'Buku belum punya bab, tidak bisa diekspor.' });
      return;
    }
    if (babRows.some((b) => b.status !== 'selesai')) {
      res.status(400).json({ message: 'Semua bab harus berstatus "selesai" sebelum export.' });
      return;
    }

    const info = db
      .prepare("INSERT INTO export_job (buku_id, format, status) VALUES (?, ?, 'pending')")
      .run(buku.id, format);
    const jobId = Number(info.lastInsertRowid);

    res.status(202).json({ id: jobId, buku_id: buku.id, format, status: 'pending' });

    void runExportJob(db, storageDir, jobId);
  });

  return router;
}

/** Mounted di /api/export — cek status & download hasil job yang dibuat lewat POST /api/buku/:id/export. */
export function exportJobRoutes({ db }: ExportRoutesOptions): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/:jobId', (req, res) => {
    const job = findJobOr404(db, req.params.jobId, res);
    if (!job) {
      return;
    }

    res.json({
      id: job.id,
      buku_id: job.buku_id,
      format: job.format,
      status: job.status,
      error_message: job.error_message,
      download_url: job.status === 'selesai' ? `/api/export/${job.id}/download` : null,
    });
  });

  router.get('/:jobId/download', (req, res) => {
    const job = findJobOr404(db, req.params.jobId, res);
    if (!job) {
      return;
    }

    if (job.status !== 'selesai' || !job.file_path) {
      res.status(400).json({ message: 'File export belum siap (status saat ini: ' + job.status + ').' });
      return;
    }

    const buku = db.prepare('SELECT judul FROM buku WHERE id = ?').get(job.buku_id) as { judul: string } | undefined;
    const ext = job.format === 'pdf' ? 'pdf' : 'docx';
    const safeTitle = (buku?.judul ?? 'buku').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'buku';
    res.download(job.file_path, `${safeTitle}.${ext}`, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ message: 'Gagal mengirim file export.' });
      }
    });
  });

  return router;
}
