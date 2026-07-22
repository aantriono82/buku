import Anthropic from '@anthropic-ai/sdk';
import { getTextProviderInfo, type TextProviderId } from './ai-providers.js';

export interface AnthropicStreamClient {
  messages: {
    stream: (
      params: {
        model: string;
        max_tokens: number;
        system: string;
        messages: Array<{ role: 'user'; content: string }>;
      },
      options?: { signal?: AbortSignal },
    ) => AsyncIterable<AnthropicStreamEvent>;
  };
}

export interface AnthropicStreamEvent {
  type: string;
  delta?: { type: string; text?: string };
}

export interface TextGenerationRequest {
  provider: TextProviderId;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
  fetchImpl?: typeof fetch;
  anthropicClientFactory?: (apiKey: string) => AnthropicStreamClient;
}

async function readSseDeltaStream(
  body: ReadableStream<Uint8Array> | null,
  onDelta: (content: string) => void,
): Promise<void> {
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue;
      }
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        continue;
      }
      try {
        const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          onDelta(content);
        }
      } catch {
        // lewati chunk yang belum lengkap/tidak valid, akan disambung baris berikutnya
      }
    }
  }
}

async function callAnthropic(req: TextGenerationRequest): Promise<string> {
  const client: AnthropicStreamClient = req.anthropicClientFactory
    ? req.anthropicClientFactory(req.apiKey)
    : (new Anthropic({ apiKey: req.apiKey }) as unknown as AnthropicStreamClient);

  const stream = client.messages.stream(
    {
      model: req.model,
      max_tokens: req.maxTokens ?? 4000,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    },
    { signal: req.signal },
  );

  let raw = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
      raw += event.delta.text;
      req.onChunk?.(event.delta.text);
    }
  }
  return raw;
}

async function callOpenAiCompatible(req: TextGenerationRequest): Promise<string> {
  const info = getTextProviderInfo(req.provider);
  const fetchImpl = req.fetchImpl ?? fetch;

  let requestModel = req.model;
  if (req.provider !== 'openrouter' && requestModel.includes('/')) {
    requestModel = requestModel.split('/').pop() as string;
  }

  const body: Record<string, unknown> = {
    model: requestModel,
    stream: true,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 4000,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
  };
  if (req.jsonMode !== false) {
    body.response_format = { type: 'json_object' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${req.apiKey}`,
  };
  if (req.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://buku.aantriono.com';
    headers['X-Title'] = 'Buku Generator';
  }

  const response = await fetchImpl(`${info.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${info.label} API error (${response.status}): ${errorText}`);
  }

  let raw = '';
  await readSseDeltaStream(response.body, (chunk) => {
    raw += chunk;
    req.onChunk?.(chunk);
  });
  return raw;
}

export async function generateText(req: TextGenerationRequest): Promise<string> {
  const info = getTextProviderInfo(req.provider);
  if (info.native === 'anthropic') {
    return callAnthropic(req);
  }
  return callOpenAiCompatible(req);
}
