import type { TextProviderCredentials } from './services/ai-providers.js';

export interface AppConfig extends TextProviderCredentials {
  PORT: number;
  NODE_ENV: string;
  DB_PATH: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  FRONTEND_URL: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    PORT: Number(env.PORT) || 3011,
    NODE_ENV: env.NODE_ENV || 'development',
    DB_PATH: env.DB_PATH || './data/buku.db',
    ADMIN_USERNAME: env.ADMIN_USERNAME || '',
    ADMIN_PASSWORD: env.ADMIN_PASSWORD || '',
    FRONTEND_URL: env.FRONTEND_URL || 'http://localhost:5183',
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || '',
    OPENCODE_API_KEY: env.OPENCODE_API_KEY || '',
    GOOGLE_AI_API_KEY: env.GOOGLE_AI_API_KEY || '',
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY || '',
    OPENAI_API_KEY: env.OPENAI_API_KEY || '',
    DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY || '',
  };
}
