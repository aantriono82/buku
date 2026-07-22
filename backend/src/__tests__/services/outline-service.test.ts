import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/ai-text-client.js', () => ({
  generateText: vi.fn(),
}));

import { generateText } from '../../services/ai-text-client.js';
import { buildOutlinePrompt, parseOutlineResponse, generateOutline } from '../../services/outline-service.js';

const mockedGenerateText = vi.mocked(generateText);

describe('buildOutlinePrompt', () => {
  it('menyertakan seluruh detail buku di prompt user', () => {
    const { system, user } = buildOutlinePrompt({
      judul: 'Matematika Dasar',
      mapel: 'Matematika',
      jenjang: 'SD Kelas 4',
      kurikulum: 'Kurikulum Merdeka',
    });

    expect(system).toContain('JSON');
    expect(user).toContain('Matematika Dasar');
    expect(user).toContain('Matematika');
    expect(user).toContain('SD Kelas 4');
    expect(user).toContain('Kurikulum Merdeka');
  });

  it('tidak menyertakan baris kurikulum kalau tidak diisi', () => {
    const { user } = buildOutlinePrompt({ judul: 'Judul', mapel: 'IPA', jenjang: 'SMP Kelas 7' });
    expect(user).not.toContain('Kurikulum:');
  });
});

describe('parseOutlineResponse', () => {
  it('parse JSON valid menjadi daftar bab', () => {
    const raw = JSON.stringify({
      bab: [
        { judul: 'Bab 1', ringkasan: 'Ringkasan 1' },
        { judul: 'Bab 2', ringkasan: 'Ringkasan 2' },
      ],
    });

    expect(parseOutlineResponse(raw)).toEqual([
      { judul: 'Bab 1', ringkasan: 'Ringkasan 1' },
      { judul: 'Bab 2', ringkasan: 'Ringkasan 2' },
    ]);
  });

  it('mengekstrak JSON dari teks yang dibungkus markdown/teks lain', () => {
    const raw = 'Berikut outlinenya:\n```json\n{"bab":[{"judul":"Bab 1","ringkasan":"Ring"}]}\n```';
    expect(parseOutlineResponse(raw)).toEqual([{ judul: 'Bab 1', ringkasan: 'Ring' }]);
  });

  it('melempar error kalau bukan JSON sama sekali', () => {
    expect(() => parseOutlineResponse('bukan json apapun')).toThrow('Respons AI bukan JSON yang valid.');
  });

  it('melempar error kalau field bab kosong/tidak ada', () => {
    expect(() => parseOutlineResponse(JSON.stringify({ bab: [] }))).toThrow('Respons AI tidak berisi daftar bab.');
    expect(() => parseOutlineResponse(JSON.stringify({ lain: 'nilai' }))).toThrow(
      'Respons AI tidak berisi daftar bab.',
    );
  });

  it('melempar error kalau salah satu bab tidak punya judul', () => {
    const raw = JSON.stringify({ bab: [{ ringkasan: 'tanpa judul' }] });
    expect(() => parseOutlineResponse(raw)).toThrow('tidak punya judul yang valid');
  });

  it('ringkasan default string kosong kalau tidak ada', () => {
    const raw = JSON.stringify({ bab: [{ judul: 'Bab 1' }] });
    expect(parseOutlineResponse(raw)).toEqual([{ judul: 'Bab 1', ringkasan: '' }]);
  });
});

describe('generateOutline', () => {
  const params = { judul: 'Matematika Dasar', mapel: 'Matematika', jenjang: 'SD Kelas 4' };

  it('memanggil generateText dengan prompt yang benar lalu parse hasilnya', async () => {
    const content = JSON.stringify({
      bab: [
        { judul: 'Bab 1', ringkasan: 'Ringkasan 1' },
        { judul: 'Bab 2', ringkasan: 'Ringkasan 2' },
      ],
    });
    mockedGenerateText.mockImplementation(async (req) => {
      req.onChunk?.(content);
      return content;
    });

    const result = await generateOutline(params, {
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'test-key',
    });

    expect(result.rawResponse).toBe(content);
    expect(result.bab).toEqual([
      { judul: 'Bab 1', ringkasan: 'Ringkasan 1' },
      { judul: 'Bab 2', ringkasan: 'Ringkasan 2' },
    ]);

    const req = mockedGenerateText.mock.calls[0][0];
    expect(req.provider).toBe('deepseek');
    expect(req.model).toBe('deepseek-chat');
    expect(req.apiKey).toBe('test-key');
    expect(req.user).toContain('Matematika Dasar');
  });

  it('meneruskan error dari generateText apa adanya', async () => {
    mockedGenerateText.mockRejectedValue(new Error('OpenRouter API error (401): unauthorized'));

    await expect(
      generateOutline(params, { provider: 'openrouter', model: 'deepseek/deepseek-chat', apiKey: 'salah' }),
    ).rejects.toThrow('OpenRouter API error (401)');
  });

  it('melempar error kalau hasil akhir bukan JSON valid', async () => {
    mockedGenerateText.mockResolvedValue('bukan json');

    await expect(
      generateOutline(params, { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'test-key' }),
    ).rejects.toThrow('Respons AI bukan JSON yang valid.');
  });
});
