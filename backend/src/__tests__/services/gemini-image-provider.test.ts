import { describe, it, expect, vi } from 'vitest';
import { GeminiImageProvider } from '../../services/gemini-image-provider.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('GeminiImageProvider', () => {
  it('mengembalikan Buffer hasil decode base64 dari inlineData', async () => {
    const base64 = Buffer.from('gambar-asli').toString('base64');
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ inlineData: { data: base64, mimeType: 'image/png' } }] } }],
      }),
    );

    const provider = new GeminiImageProvider({ apiKey: 'test-key', fetchImpl });
    const buffer = await provider.generate('ilustrasi gunung');

    expect(buffer.toString()).toBe('gambar-asli');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain('gemini-3-pro-image-preview:generateContent');
    expect(url).toContain('key=test-key');
    expect(JSON.parse((options as { body: string }).body).contents[0].parts[0].text).toBe('ilustrasi gunung');
  });

  it('menyisipkan opsi size ke prompt', async () => {
    const base64 = Buffer.from('x').toString('base64');
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { data: base64 } }] } }] }));

    const provider = new GeminiImageProvider({ apiKey: 'k', fetchImpl });
    await provider.generate('prompt', { size: '1024x1024' });

    const [, options] = fetchImpl.mock.calls[0];
    const text = JSON.parse((options as { body: string }).body).contents[0].parts[0].text as string;
    expect(text).toContain('prompt');
    expect(text).toContain('1024x1024');
  });

  it('melempar error kalau response bukan ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'quota exceeded' }, false, 429));
    const provider = new GeminiImageProvider({ apiKey: 'k', fetchImpl });

    await expect(provider.generate('prompt')).rejects.toThrow('Gemini Image API error (429)');
  });

  it('melempar error kalau response tidak berisi inlineData', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [] } }] }));
    const provider = new GeminiImageProvider({ apiKey: 'k', fetchImpl });

    await expect(provider.generate('prompt')).rejects.toThrow('tidak mengembalikan data gambar');
  });

  it('memakai model kustom kalau diberikan', async () => {
    const base64 = Buffer.from('x').toString('base64');
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { data: base64 } }] } }] }));
    const provider = new GeminiImageProvider({ apiKey: 'k', model: 'model-lain', fetchImpl });

    await provider.generate('prompt');

    expect(fetchImpl.mock.calls[0][0]).toContain('model-lain:generateContent');
  });
});
