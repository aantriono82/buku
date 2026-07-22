import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEXT_PROVIDER_CREDENTIALS,
  TEXT_PROVIDERS,
  getTextProviderInfo,
  isTextProviderId,
  listAvailableTextProviders,
  resolveProviderApiKey,
  type TextProviderCredentials,
} from '../../services/ai-providers.js';

describe('isTextProviderId', () => {
  it('true untuk id provider yang valid', () => {
    expect(isTextProviderId('openrouter')).toBe(true);
    expect(isTextProviderId('anthropic')).toBe(true);
  });

  it('false untuk id yang tidak dikenal', () => {
    expect(isTextProviderId('bukan-provider')).toBe(false);
    expect(isTextProviderId('')).toBe(false);
  });
});

describe('getTextProviderInfo', () => {
  it('mengembalikan info provider yang benar', () => {
    const info = getTextProviderInfo('anthropic');
    expect(info.label).toBe('Anthropic');
    expect(info.native).toBe('anthropic');
    expect(info.envKey).toBe('ANTHROPIC_API_KEY');
  });

  it('mencakup keenam provider yang disepakati', () => {
    const ids = TEXT_PROVIDERS.map((p) => p.id).sort();
    expect(ids).toEqual(['anthropic', 'deepseek', 'google', 'openai', 'opencode', 'openrouter'].sort());
  });
});

describe('resolveProviderApiKey', () => {
  it('mengambil api key sesuai env key provider', () => {
    const credentials: TextProviderCredentials = {
      ...DEFAULT_TEXT_PROVIDER_CREDENTIALS,
      OPENROUTER_API_KEY: 'key-openrouter',
    };
    expect(resolveProviderApiKey('openrouter', credentials)).toBe('key-openrouter');
    expect(resolveProviderApiKey('openai', credentials)).toBe('');
  });
});

describe('listAvailableTextProviders', () => {
  it('hanya mengembalikan provider yang api key-nya terisi', () => {
    const credentials: TextProviderCredentials = {
      ...DEFAULT_TEXT_PROVIDER_CREDENTIALS,
      OPENROUTER_API_KEY: 'key-openrouter',
      ANTHROPIC_API_KEY: 'key-anthropic',
    };

    const available = listAvailableTextProviders(credentials);
    expect(available.map((p) => p.id).sort()).toEqual(['anthropic', 'openrouter']);
  });

  it('kosong kalau tidak ada satupun api key terisi', () => {
    expect(listAvailableTextProviders(DEFAULT_TEXT_PROVIDER_CREDENTIALS)).toEqual([]);
  });
});
