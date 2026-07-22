import { generateText, type AnthropicStreamClient } from './ai-text-client.js';
import type { TextProviderId } from './ai-providers.js';

export interface OutlineParams {
  judul: string;
  mapel: string;
  jenjang: string;
  kurikulum?: string;
}

export interface OutlineBab {
  judul: string;
  ringkasan: string;
}

export interface GenerateOutlineOptions {
  provider: TextProviderId;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
  fetchImpl?: typeof fetch;
  anthropicClientFactory?: (apiKey: string) => AnthropicStreamClient;
}

export interface GenerateOutlineResult {
  bab: OutlineBab[];
  rawResponse: string;
}

export function buildOutlinePrompt(params: OutlineParams): { system: string; user: string } {
  const system =
    'Anda adalah asisten kurikulum yang menyusun outline buku pelajaran sekolah Indonesia. ' +
    'Selalu jawab HANYA dengan JSON valid tanpa teks atau markdown lain, dengan struktur persis: ' +
    '{"bab": [{"judul": "...", "ringkasan": "..."}]}.';

  const user = [
    'Buatkan outline (daftar bab) untuk buku pelajaran dengan detail berikut:',
    `- Judul buku: ${params.judul}`,
    `- Mata pelajaran: ${params.mapel}`,
    `- Jenjang/kelas: ${params.jenjang}`,
    params.kurikulum ? `- Kurikulum: ${params.kurikulum}` : null,
    '',
    'Susun sekitar 5 bab yang berurutan secara logis dan mencakup kompetensi inti mata pelajaran ' +
      'tersebut untuk jenjang yang dimaksud. Tiap bab wajib memiliki "judul" singkat dan "ringkasan" ' +
      '1-2 kalimat tentang cakupan materinya.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return { system, user };
}

export function parseOutlineResponse(raw: string): OutlineBab[] {
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

  const babList = (parsed as { bab?: unknown } | null)?.bab;
  if (!Array.isArray(babList) || babList.length === 0) {
    throw new Error('Respons AI tidak berisi daftar bab.');
  }

  return babList.map((item, idx) => {
    const judul = (item as { judul?: unknown } | null)?.judul;
    const ringkasan = (item as { ringkasan?: unknown } | null)?.ringkasan;

    if (typeof judul !== 'string' || !judul.trim()) {
      throw new Error(`Bab ke-${idx + 1} dari respons AI tidak punya judul yang valid.`);
    }

    return {
      judul: judul.trim(),
      ringkasan: typeof ringkasan === 'string' ? ringkasan.trim() : '',
    };
  });
}

export async function generateOutline(
  params: OutlineParams,
  options: GenerateOutlineOptions,
): Promise<GenerateOutlineResult> {
  const { system, user } = buildOutlinePrompt(params);

  const rawResponse = await generateText({
    provider: options.provider,
    model: options.model,
    apiKey: options.apiKey,
    system,
    user,
    signal: options.signal,
    onChunk: options.onChunk,
    fetchImpl: options.fetchImpl,
    anthropicClientFactory: options.anthropicClientFactory,
  });

  const bab = parseOutlineResponse(rawResponse);
  return { bab, rawResponse };
}
