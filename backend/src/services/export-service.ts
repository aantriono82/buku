import { spawn, type ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { imageSize } from 'image-size';
import type { ChartData } from './chart-render-service.js';
import type { DiagramData } from './diagram-render-service.js';
import type { GambarData } from './content-service.js';

export interface BukuForExport {
  judul: string;
  mapel: string;
  jenjang: string;
  kurikulum?: string | null;
}

export interface BlokForExport {
  tipe: string;
  data: unknown;
  file_path?: string | null;
}

export interface BabForExport {
  urutan: number;
  judul: string;
  blok: BlokForExport[];
}

const MAX_IMAGE_WIDTH_PX = 500;
const RASTER_TYPE_BY_EXT: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = {
  '.png': 'png',
  '.jpg': 'jpg',
  '.jpeg': 'jpg',
  '.gif': 'gif',
  '.bmp': 'bmp',
};

function warningParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, italics: true })],
  });
}

/**
 * Sisipkan gambar (chart/diagram/gambar) sebagai ImageRun. Format yang tidak didukung `docx` (mis. webp hasil
 * upload manual) atau file yang gagal dibaca tidak menggagalkan seluruh export — diganti paragraf peringatan,
 * konsisten dengan pola "kegagalan satu blok tidak menggagalkan proses lain" di chartRenderService/imageService.
 */
async function imageParagraphs(filePath: string, caption?: string): Promise<Paragraph[]> {
  const ext = path.extname(filePath).toLowerCase();
  const type = RASTER_TYPE_BY_EXT[ext];
  if (!type) {
    return [
      warningParagraph(`[Gambar tidak disertakan: format "${ext || 'tidak diketahui'}" tidak didukung ekspor DOCX]`),
    ];
  }

  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return [warningParagraph('[Gambar tidak disertakan: file tidak ditemukan di server]')];
  }

  let width = MAX_IMAGE_WIDTH_PX;
  let height = MAX_IMAGE_WIDTH_PX;
  try {
    const dims = imageSize(data);
    if (dims.width && dims.height) {
      width = Math.min(dims.width, MAX_IMAGE_WIDTH_PX);
      height = Math.round((width * dims.height) / dims.width);
    }
  } catch {
    // Dimensi tidak terbaca (file korup) - tetap coba sisipkan dengan ukuran default persegi.
  }

  const paragraphs: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ type, data, transformation: { width, height } })],
    }),
  ];
  if (caption?.trim()) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: caption.trim(), italics: true, size: 20 })],
      }),
    );
  }
  return paragraphs;
}

function markdownToParagraphs(markdown: string): Paragraph[] {
  const lines = markdown.split(/\r?\n/);
  const paragraphs: Paragraph[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const heading =
        level === 1 ? HeadingLevel.HEADING_2 : level === 2 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4;
      paragraphs.push(new Paragraph({ text: headingMatch[2].trim(), heading }));
    } else {
      paragraphs.push(new Paragraph({ text: line, spacing: { after: 160 } }));
    }
  }
  return paragraphs;
}

function tableToDocxTable(data: { headers: string[]; rows: string[][] }): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: data.headers.map(
      (h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] }),
    ),
  });
  const dataRows = data.rows.map(
    (row) =>
      new TableRow({
        children: row.map((cell) => new TableCell({ children: [new Paragraph(cell)] })),
      }),
  );
  return new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } });
}

async function blokToDocxElements(blok: BlokForExport): Promise<Array<Paragraph | Table>> {
  switch (blok.tipe) {
    case 'teks':
      return markdownToParagraphs((blok.data as { markdown: string }).markdown ?? '');
    case 'tabel':
      return [tableToDocxTable(blok.data as { headers: string[]; rows: string[][] }), new Paragraph({ text: '' })];
    case 'chart':
    case 'diagram':
    case 'gambar': {
      if (!blok.file_path) {
        return [warningParagraph('[Media belum tersedia — belum selesai dirender/digenerate]')];
      }
      const caption =
        blok.tipe === 'gambar' ? (blok.data as GambarData).caption : (blok.data as ChartData | DiagramData).judul;
      return imageParagraphs(blok.file_path, caption);
    }
    default:
      return [];
  }
}

export async function buildDocx(buku: BukuForExport, babList: BabForExport[]): Promise<Buffer> {
  if (babList.length === 0) {
    throw new Error('Buku belum punya bab untuk diekspor.');
  }

  const children: Array<Paragraph | Table> = [
    new Paragraph({ text: buku.judul, heading: HeadingLevel.TITLE }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${buku.mapel} — ${buku.jenjang}${buku.kurikulum ? ` — ${buku.kurikulum}` : ''}`,
        }),
      ],
    }),
  ];

  for (const bab of babList) {
    children.push(
      new Paragraph({
        text: `Bab ${bab.urutan}: ${bab.judul}`,
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
      }),
    );
    for (const blok of bab.blok) {
      children.push(...(await blokToDocxElements(blok)));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export type SpawnFn = (command: string, args: readonly string[]) => ChildProcess;

export interface ConvertDocxToPdfOptions {
  outputDir: string;
  sofficePath?: string;
  spawnImpl?: SpawnFn;
}

function runSoffice(spawnFn: SpawnFn, sofficePath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(sofficePath, args);
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`LibreOffice keluar dengan kode ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
      }
    });
  });
}

export async function convertDocxToPdf(docxPath: string, options: ConvertDocxToPdfOptions): Promise<string> {
  await fs.mkdir(options.outputDir, { recursive: true });
  const sofficePath = options.sofficePath ?? 'soffice';
  await runSoffice(options.spawnImpl ?? spawn, sofficePath, [
    '--headless',
    '--convert-to',
    'pdf',
    '--outdir',
    options.outputDir,
    docxPath,
  ]);

  const pdfPath = path.join(options.outputDir, `${path.basename(docxPath, path.extname(docxPath))}.pdf`);
  try {
    await fs.access(pdfPath);
  } catch {
    throw new Error('Konversi PDF gagal: file output tidak ditemukan setelah LibreOffice selesai.');
  }
  return pdfPath;
}
