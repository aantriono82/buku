import { describe, it, expect, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import {
  buildDocx,
  convertDocxToPdf,
  type BabForExport,
  type BukuForExport,
  type SpawnFn,
} from '../../services/export-service.js';

// PNG 1x1 valid minimal, cukup untuk dibaca image-size & ImageRun docx.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'export-service-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const buku: BukuForExport = {
  judul: 'Mengenal Ekosistem',
  mapel: 'IPA',
  jenjang: 'SD Kelas 5',
  kurikulum: 'Kurikulum Merdeka',
};

async function documentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file('word/document.xml');
  expect(file).not.toBeNull();
  return file!.async('text');
}

describe('buildDocx', () => {
  it('menolak buku tanpa bab', async () => {
    await expect(buildDocx(buku, [])).rejects.toThrow('Buku belum punya bab');
  });

  it('menghasilkan DOCX valid berisi semua tipe blok (teks, tabel, chart, diagram, gambar)', async () => {
    const dir = await makeTmpDir();
    const chartPath = path.join(dir, 'chart.png');
    const diagramPath = path.join(dir, 'diagram.png');
    const gambarPath = path.join(dir, 'gambar.png');
    await Promise.all([
      fs.writeFile(chartPath, TINY_PNG),
      fs.writeFile(diagramPath, TINY_PNG),
      fs.writeFile(gambarPath, TINY_PNG),
    ]);

    const babList: BabForExport[] = [
      {
        urutan: 1,
        judul: 'Rantai Makanan',
        blok: [
          { tipe: 'teks', data: { markdown: '# Pendahuluan\nEkosistem terdiri dari makhluk hidup dan lingkungan.' } },
          { tipe: 'tabel', data: { headers: ['Produsen', 'Konsumen'], rows: [['Padi', 'Tikus']] } },
          {
            tipe: 'chart',
            data: { chart_type: 'bar', labels: ['A'], datasets: [{ label: 'x', data: [1] }], judul: 'Grafik Populasi' },
            file_path: chartPath,
          },
          {
            tipe: 'diagram',
            data: { mermaid_syntax: 'flowchart TD\nA-->B', judul: 'Alur Energi' },
            file_path: diagramPath,
          },
          { tipe: 'gambar', data: { source: 'ai', caption: 'Ilustrasi rantai makanan' }, file_path: gambarPath },
          { tipe: 'gambar', data: { source: 'upload' }, file_path: null },
        ],
      },
    ];

    const buffer = await buildDocx(buku, babList);
    expect(buffer.subarray(0, 2)).toEqual(Buffer.from('PK'));

    const xml = await documentXml(buffer);
    expect(xml).toContain('Mengenal Ekosistem');
    expect(xml).toContain('Bab 1: Rantai Makanan');
    expect(xml).toContain('Pendahuluan');
    expect(xml).toContain('Produsen');
    expect(xml).toContain('Grafik Populasi');
    expect(xml).toContain('Alur Energi');
    expect(xml).toContain('Ilustrasi rantai makanan');
    expect(xml).toContain('Media belum tersedia');
  });

  it('menyisipkan peringatan (bukan gagal total) untuk format gambar yang tidak didukung docx (mis. webp)', async () => {
    const dir = await makeTmpDir();
    const webpPath = path.join(dir, 'gambar.webp');
    await fs.writeFile(webpPath, TINY_PNG);

    const babList: BabForExport[] = [
      {
        urutan: 1,
        judul: 'Bab Uji',
        blok: [{ tipe: 'gambar', data: { source: 'upload' }, file_path: webpPath }],
      },
    ];

    const buffer = await buildDocx(buku, babList);
    const xml = await documentXml(buffer);
    expect(xml).toContain('tidak didukung ekspor DOCX');
  });

  it('menyisipkan peringatan kalau file gambar tidak ditemukan di disk', async () => {
    const babList: BabForExport[] = [
      {
        urutan: 1,
        judul: 'Bab Uji',
        blok: [{ tipe: 'chart', data: { chart_type: 'bar' }, file_path: '/tidak/ada/file.png' }],
      },
    ];

    const buffer = await buildDocx(buku, babList);
    const xml = await documentXml(buffer);
    expect(xml).toContain('file tidak ditemukan');
  });
});

function fakeSpawn(behavior: (args: readonly string[]) => Promise<{ code: number; stderr?: string }>): SpawnFn {
  return (_command: string, args: readonly string[]) => {
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
    child.stderr = new EventEmitter();
    behavior(args).then(({ code, stderr }) => {
      if (stderr) {
        child.stderr.emit('data', Buffer.from(stderr));
      }
      child.emit('exit', code);
    });
    return child as unknown as ReturnType<SpawnFn>;
  };
}

describe('convertDocxToPdf', () => {
  it('mengembalikan path PDF saat soffice sukses dan file output ada', async () => {
    const dir = await makeTmpDir();
    const docxPath = path.join(dir, 'buku-1.docx');
    await fs.writeFile(docxPath, 'dummy docx');

    const spawnImpl = fakeSpawn(async () => {
      await fs.writeFile(path.join(dir, 'buku-1.pdf'), 'dummy pdf');
      return { code: 0 };
    });

    const pdfPath = await convertDocxToPdf(docxPath, { outputDir: dir, spawnImpl, sofficePath: '/fake/soffice' });
    expect(pdfPath).toBe(path.join(dir, 'buku-1.pdf'));
  });

  it('melempar error kalau soffice keluar dengan kode non-zero', async () => {
    const dir = await makeTmpDir();
    const docxPath = path.join(dir, 'buku-1.docx');
    await fs.writeFile(docxPath, 'dummy docx');

    const spawnImpl = fakeSpawn(async () => ({ code: 1, stderr: 'LibreOffice error' }));

    await expect(convertDocxToPdf(docxPath, { outputDir: dir, spawnImpl })).rejects.toThrow(
      /LibreOffice keluar dengan kode 1/,
    );
  });

  it('melempar error kalau soffice sukses tapi file PDF tidak dihasilkan', async () => {
    const dir = await makeTmpDir();
    const docxPath = path.join(dir, 'buku-1.docx');
    await fs.writeFile(docxPath, 'dummy docx');

    const spawnImpl = fakeSpawn(async () => ({ code: 0 }));

    await expect(convertDocxToPdf(docxPath, { outputDir: dir, spawnImpl })).rejects.toThrow(
      'file output tidak ditemukan',
    );
  });
});
