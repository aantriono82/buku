import { describe, it, expect, vi } from 'vitest';
import { generateText, type AnthropicStreamClient, type AnthropicStreamEvent } from '../../services/ai-text-client.js';

function makeMockStreamResponse(
  content: string,
  chunkSize = 20,
): { ok: true; status: 200; body: ReadableStream<Uint8Array>; text: () => Promise<string> } {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    parts.push(content.slice(i, i + chunkSize));
  }

  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= parts.length) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        return;
      }
      const piece = parts[index++];
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`));
    },
  });

  return { ok: true, status: 200, body, text: async () => '' };
}

async function* toAsyncIterable(events: AnthropicStreamEvent[]): AsyncIterable<AnthropicStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

describe('generateText — jalur OpenAI-compatible', () => {
  it('men-stream chunk via onChunk dan mengembalikan teks lengkap', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeMockStreamResponse('halo dunia'));
    const chunks: string[] = [];

    const result = await generateText({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'key-123',
      system: 'system prompt',
      user: 'user prompt',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onChunk: (c) => chunks.push(c),
    });

    expect(result).toBe('halo dunia');
    expect(chunks.join('')).toBe('halo dunia');

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-chat');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(init.headers).toMatchObject({ Authorization: 'Bearer key-123' });
    expect((init.headers as Record<string, string>)['HTTP-Referer']).toBeUndefined();
  });

  it('menyertakan header HTTP-Referer/X-Title khusus untuk OpenRouter', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeMockStreamResponse('ok'));
    await generateText({
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      apiKey: 'key-openrouter',
      system: 's',
      user: 'u',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'HTTP-Referer': 'https://buku.aantriono.com' });
  });

  it('mempertahankan prefix vendor/model untuk OpenRouter, tapi strip untuk provider lain', async () => {
    const fetchImplOpenRouter = vi.fn().mockResolvedValue(makeMockStreamResponse('ok'));
    await generateText({
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      apiKey: 'k',
      system: 's',
      user: 'u',
      fetchImpl: fetchImplOpenRouter as unknown as typeof fetch,
    });
    const [, initOpenRouter] = fetchImplOpenRouter.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(initOpenRouter.body as string).model).toBe('deepseek/deepseek-chat');

    const fetchImplOpenAi = vi.fn().mockResolvedValue(makeMockStreamResponse('ok'));
    await generateText({
      provider: 'openai',
      model: 'vendor/gpt-4o-mini',
      apiKey: 'k',
      system: 's',
      user: 'u',
      fetchImpl: fetchImplOpenAi as unknown as typeof fetch,
    });
    const [, initOpenAi] = fetchImplOpenAi.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(initOpenAi.body as string).model).toBe('gpt-4o-mini');
  });

  it('tidak menyertakan response_format kalau jsonMode: false', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeMockStreamResponse('ok'));
    await generateText({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'k',
      system: 's',
      user: 'u',
      jsonMode: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).response_format).toBeUndefined();
  });

  it('melempar error berisi label provider kalau response tidak ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
    await expect(
      generateText({
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'salah',
        system: 's',
        user: 'u',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('OpenAI API error (401): unauthorized');
  });
});

describe('generateText — jalur native Anthropic', () => {
  it('men-stream delta text via onChunk dan mengembalikan teks lengkap', async () => {
    const events: AnthropicStreamEvent[] = [
      { type: 'message_start' },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'halo ' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'dunia' } },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', text: 'diabaikan' } },
      { type: 'message_stop' },
    ];

    const streamSpy = vi.fn().mockReturnValue(toAsyncIterable(events));
    const clientFactory = vi.fn((): AnthropicStreamClient => ({
      messages: { stream: streamSpy },
    }));

    const chunks: string[] = [];
    const result = await generateText({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      apiKey: 'anthropic-key',
      system: 'system prompt',
      user: 'user prompt',
      anthropicClientFactory: clientFactory,
      onChunk: (c) => chunks.push(c),
    });

    expect(result).toBe('halo dunia');
    expect(chunks).toEqual(['halo ', 'dunia']);
    expect(clientFactory).toHaveBeenCalledWith('anthropic-key');
    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5',
        system: 'system prompt',
        messages: [{ role: 'user', content: 'user prompt' }],
      }),
      expect.anything(),
    );
  });
});
