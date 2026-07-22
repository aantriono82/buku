export interface SseExtractResult {
  events: string[];
  remainder: string;
}

/**
 * Ambil semua baris "data: ..." yang sudah lengkap dari buffer teks stream SSE.
 * Baris terakhir yang mungkin belum lengkap (belum ada `\n` penutup) dikembalikan
 * sebagai remainder untuk disambung ke chunk berikutnya.
 */
export function extractSseDataLines(buffer: string): SseExtractResult {
  const lines = buffer.split('\n');
  const remainder = lines.pop() ?? '';
  const events: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) {
      continue;
    }
    const data = trimmed.slice(6).trim();
    if (data === '[DONE]') {
      continue;
    }
    events.push(data);
  }

  return { events, remainder };
}
