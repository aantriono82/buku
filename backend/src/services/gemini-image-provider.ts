import type { ImageProvider } from './image-service.js';

const DEFAULT_MODEL = 'gemini-3-pro-image-preview';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiImageProviderOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
    };
  }>;
}

export class GeminiImageProvider implements ImageProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GeminiImageProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(prompt: string, opts?: { size?: string }): Promise<Buffer> {
    const promptText = opts?.size ? `${prompt}\n\n(Rasio/ukuran gambar: ${opts.size})` : prompt;

    const response = await this.fetchImpl(`${API_BASE}/${this.model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini Image API error (${response.status}): ${errorText}`);
    }

    const json = (await response.json()) as GeminiGenerateContentResponse;
    const base64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;

    if (!base64) {
      throw new Error('Gemini Image API tidak mengembalikan data gambar.');
    }

    return Buffer.from(base64, 'base64');
  }
}
