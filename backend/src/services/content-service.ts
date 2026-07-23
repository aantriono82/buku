import { generateText, type AnthropicStreamClient } from './ai-text-client.js';
import type { TextProviderId } from './ai-providers.js';
import { isValidChartData, type ChartData } from './chart-render-service.js';
import { isValidDiagramData, type DiagramData } from './diagram-render-service.js';

export interface ContentParams {
  judulBuku: string;
  mapel: string;
  jenjang: string;
  kurikulum?: string;
  judulBab: string;
  ringkasanBab?: string;
}

export interface BlokTeks {
  tipe: 'teks';
  data: { markdown: string };
}

export interface BlokTabel {
  tipe: 'tabel';
  data: { headers: string[]; rows: string[][] };
}

export interface BlokChart {
  tipe: 'chart';
  data: ChartData;
}

export interface BlokDiagram {
  tipe: 'diagram';
  data: DiagramData;
}

export type ContentBlok = BlokTeks | BlokTabel | BlokChart | BlokDiagram;

export interface GenerateContentOptions {
  provider: TextProviderId;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
  fetchImpl?: typeof fetch;
  anthropicClientFactory?: (apiKey: string) => AnthropicStreamClient;
}

export interface GenerateContentResult {
  blok: ContentBlok[];
  rawResponse: string;
}

export function buildContentPrompt(params: ContentParams): { system: string; user: string } {
  const system =
    'Anda adalah penulis buku pelajaran sekolah Indonesia yang menyusun isi satu bab dalam bentuk blok konten ' +
    'terstruktur. Selalu jawab HANYA dengan JSON valid tanpa teks atau markdown lain, dengan struktur persis: ' +
    '{"blok": [{"tipe": "teks", "data": {"markdown": "..."}}, {"tipe": "tabel", "data": {"headers": ["..."], ' +
    '"rows": [["...", "..."]]}}, {"tipe": "chart", "data": {"chart_type": "bar|line|pie", "labels": ["..."], ' +
    '"datasets": [{"label": "...", "data": [1,2,3]}], "judul": "..."}}, {"tipe": "diagram", "data": ' +
    '{"mermaid_syntax": "flowchart TD\\nA-->B", "judul": "..."}}]}. Tipe blok yang boleh dipakai hanya "teks", ' +
    '"tabel", "chart", dan "diagram".';

  const user = [
    'Tulis isi lengkap untuk satu bab buku pelajaran berikut:',
    `- Judul buku: ${params.judulBuku}`,
    `- Mata pelajaran: ${params.mapel}`,
    `- Jenjang/kelas: ${params.jenjang}`,
    params.kurikulum ? `- Kurikulum: ${params.kurikulum}` : null,
    `- Judul bab: ${params.judulBab}`,
    params.ringkasanBab ? `- Ringkasan cakupan bab: ${params.ringkasanBab}` : null,
    '',
    'Susun beberapa blok teks penjelasan (markdown, boleh berisi subjudul, paragraf, daftar) yang runtut dan ' +
      'mendalam sesuai cakupan bab, serta sisipkan blok tabel bila ada perbandingan/klasifikasi/data yang cocok ' +
      'disajikan sebagai tabel. Sisipkan juga blok chart (bar/line/pie) HANYA bila ada data numerik yang benar-benar ' +
      'cocok divisualisasikan, dan blok diagram (mermaid flowchart) HANYA bila ada alur proses atau hubungan ' +
      'konsep yang cocok digambarkan sebagai diagram — jangan paksakan chart/diagram kalau materi tidak butuh, ' +
      'teks & tabel tetap boleh mendominasi. Urutkan blok sesuai alur penyajian materi yang logis, dari pengantar ' +
      'sampai rangkuman.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return { system, user };
}

function parseTeksBlok(data: unknown, idx: number): BlokTeks {
  const markdown = (data as { markdown?: unknown } | null)?.markdown;
  if (typeof markdown !== 'string' || !markdown.trim()) {
    throw new Error(`Blok ke-${idx + 1} bertipe teks tidak punya markdown yang valid.`);
  }
  return { tipe: 'teks', data: { markdown: markdown.trim() } };
}

function parseTabelBlok(data: unknown, idx: number): BlokTabel {
  const headers = (data as { headers?: unknown } | null)?.headers;
  const rows = (data as { rows?: unknown } | null)?.rows;

  if (!Array.isArray(headers) || headers.length === 0 || !headers.every((h) => typeof h === 'string')) {
    throw new Error(`Blok ke-${idx + 1} bertipe tabel tidak punya headers yang valid.`);
  }

  const isValidCell = (c: unknown): c is string | number => typeof c === 'string' || typeof c === 'number';
  if (!Array.isArray(rows) || !rows.every((r) => Array.isArray(r) && r.every(isValidCell))) {
    throw new Error(`Blok ke-${idx + 1} bertipe tabel tidak punya rows yang valid.`);
  }

  return {
    tipe: 'tabel',
    data: {
      headers,
      rows: rows.map((r: Array<string | number>) => r.map((c) => String(c))),
    },
  };
}

function parseChartBlok(data: unknown, idx: number): BlokChart {
  if (!isValidChartData(data)) {
    throw new Error(`Blok ke-${idx + 1} bertipe chart tidak punya data chart yang valid.`);
  }
  return { tipe: 'chart', data };
}

function parseDiagramBlok(data: unknown, idx: number): BlokDiagram {
  if (!isValidDiagramData(data)) {
    throw new Error(`Blok ke-${idx + 1} bertipe diagram tidak punya mermaid_syntax yang valid.`);
  }
  return { tipe: 'diagram', data };
}

export function parseContentResponse(raw: string): ContentBlok[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('Respons AI bukan JSON yang valid.');
    }
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new Error('Respons AI bukan JSON yang valid.');
    }
  }

  const blokList = (parsed as { blok?: unknown } | null)?.blok;
  if (!Array.isArray(blokList) || blokList.length === 0) {
    throw new Error('Respons AI tidak berisi blok konten.');
  }

  return blokList.map((item, idx) => {
    const tipe = (item as { tipe?: unknown } | null)?.tipe;
    const data = (item as { data?: unknown } | null)?.data;

    if (tipe === 'teks') {
      return parseTeksBlok(data, idx);
    }
    if (tipe === 'tabel') {
      return parseTabelBlok(data, idx);
    }
    if (tipe === 'chart') {
      return parseChartBlok(data, idx);
    }
    if (tipe === 'diagram') {
      return parseDiagramBlok(data, idx);
    }
    throw new Error(`Blok ke-${idx + 1} punya tipe tidak dikenal: "${String(tipe)}".`);
  });
}

export async function generateContent(
  params: ContentParams,
  options: GenerateContentOptions,
): Promise<GenerateContentResult> {
  const { system, user } = buildContentPrompt(params);

  const rawResponse = await generateText({
    provider: options.provider,
    model: options.model,
    apiKey: options.apiKey,
    system,
    user,
    maxTokens: 8000,
    signal: options.signal,
    onChunk: options.onChunk,
    fetchImpl: options.fetchImpl,
    anthropicClientFactory: options.anthropicClientFactory,
  });

  const blok = parseContentResponse(rawResponse);
  return { blok, rawResponse };
}
