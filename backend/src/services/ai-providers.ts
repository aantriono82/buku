export type TextProviderId = 'openrouter' | 'opencode' | 'google' | 'anthropic' | 'openai' | 'deepseek';

export interface TextProviderCredentials {
  OPENROUTER_API_KEY: string;
  OPENCODE_API_KEY: string;
  GOOGLE_AI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  DEEPSEEK_API_KEY: string;
}

export const DEFAULT_TEXT_PROVIDER_CREDENTIALS: TextProviderCredentials = {
  OPENROUTER_API_KEY: '',
  OPENCODE_API_KEY: '',
  GOOGLE_AI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  OPENAI_API_KEY: '',
  DEEPSEEK_API_KEY: '',
};

export interface TextProviderInfo {
  id: TextProviderId;
  label: string;
  baseUrl: string;
  envKey: keyof TextProviderCredentials;
  defaultModel: string;
  /** Jalur native (bukan OpenAI-compatible chat completions) — beda format request/response. */
  native?: 'anthropic';
}

export const TEXT_PROVIDERS: TextProviderInfo[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'deepseek/deepseek-chat',
  },
  {
    id: 'opencode',
    label: 'OpenCode Zen',
    baseUrl: 'https://api.opencode.ai/v1',
    envKey: 'OPENCODE_API_KEY',
    defaultModel: '',
  },
  {
    id: 'google',
    label: 'Google AI (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKey: 'GOOGLE_AI_API_KEY',
    defaultModel: 'gemini-2.0-flash',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-5',
    native: 'anthropic',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
  },
];

const TEXT_PROVIDER_IDS = new Set<string>(TEXT_PROVIDERS.map((p) => p.id));

export function isTextProviderId(value: string): value is TextProviderId {
  return TEXT_PROVIDER_IDS.has(value);
}

export function getTextProviderInfo(id: TextProviderId): TextProviderInfo {
  const info = TEXT_PROVIDERS.find((p) => p.id === id);
  if (!info) {
    throw new Error(`Provider AI teks tidak dikenal: ${id}`);
  }
  return info;
}

export function resolveProviderApiKey(id: TextProviderId, credentials: TextProviderCredentials): string {
  const info = getTextProviderInfo(id);
  return credentials[info.envKey];
}

export interface AvailableTextProvider {
  id: TextProviderId;
  label: string;
  defaultModel: string;
}

export function listAvailableTextProviders(credentials: TextProviderCredentials): AvailableTextProvider[] {
  return TEXT_PROVIDERS.filter((p) => Boolean(credentials[p.envKey])).map((p) => ({
    id: p.id,
    label: p.label,
    defaultModel: p.defaultModel,
  }));
}
