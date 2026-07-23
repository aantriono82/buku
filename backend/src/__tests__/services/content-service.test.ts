import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/ai-text-client.js', () => ({
  generateText: vi.fn(),
}));

import { generateText } from '../../services/ai-text-client.js';
import { buildContentPrompt, parseContentResponse, generateContent } from '../../services/content-service.js';

const mockedGenerateText = vi.mocked(generateText);

describe('buildContentPrompt', () => {
  it('menyertakan seluruh detail buku dan bab di prompt user', () => {
    const { system, user } = buildContentPrompt({
      judulBuku: 'Matematika Dasar',
      mapel: 'Matematika',
      jenjang: 'SD Kelas 4',
      kurikulum: 'Kurikulum Merdeka',
      judulBab: 'Pecahan',
      ringkasanBab: 'Pengenalan konsep pecahan sederhana',
    });

    expect(system).toContain('JSON');
    expect(system).toContain('teks');
    expect(system).toContain('tabel');
    expect(system).toContain('chart');
    expect(system).toContain('diagram');
    expect(user).toContain('Matematika Dasar');
    expect(user).toContain('SD Kelas 4');
    expect(user).toContain('Kurikulum Merdeka');
    expect(user).toContain('Pecahan');
    expect(user).toContain('Pengenalan konsep pecahan sederhana');
  });

  it('tidak menyertakan baris kurikulum/ringkasan kalau tidak diisi', () => {
    const { user } = buildContentPrompt({
      judulBuku: 'Judul',
      mapel: 'IPA',
      jenjang: 'SMP Kelas 7',
      judulBab: 'Bab 1',
    });
    expect(user).not.toContain('Kurikulum:');
    expect(user).not.toContain('Ringkasan cakupan bab:');
  });
});

describe('parseContentResponse', () => {
  it('parse JSON valid menjadi daftar blok teks dan tabel', () => {
    const raw = JSON.stringify({
      blok: [
        { tipe: 'teks', data: { markdown: '# Pendahuluan\nIsi bab.' } },
        { tipe: 'tabel', data: { headers: ['A', 'B'], rows: [['1', '2']] } },
      ],
    });

    expect(parseContentResponse(raw)).toEqual([
      { tipe: 'teks', data: { markdown: '# Pendahuluan\nIsi bab.' } },
      { tipe: 'tabel', data: { headers: ['A', 'B'], rows: [['1', '2']] } },
    ]);
  });

  it('mengekstrak JSON dari teks yang dibungkus markdown/teks lain', () => {
    const raw = 'Berikut isinya:\n```json\n{"blok":[{"tipe":"teks","data":{"markdown":"Isi"}}]}\n```';
    expect(parseContentResponse(raw)).toEqual([{ tipe: 'teks', data: { markdown: 'Isi' } }]);
  });

  it('mengoersi sel angka pada tabel jadi string', () => {
    const raw = JSON.stringify({
      blok: [
        {
          tipe: 'tabel',
          data: {
            headers: ['No', 'Nilai'],
            rows: [
              [1, 90],
              [2, 85],
            ],
          },
        },
      ],
    });
    expect(parseContentResponse(raw)).toEqual([
      {
        tipe: 'tabel',
        data: {
          headers: ['No', 'Nilai'],
          rows: [
            ['1', '90'],
            ['2', '85'],
          ],
        },
      },
    ]);
  });

  it('melempar error kalau bukan JSON sama sekali', () => {
    expect(() => parseContentResponse('bukan json apapun')).toThrow('Respons AI bukan JSON yang valid.');
  });

  it('melempar error kalau field blok kosong/tidak ada', () => {
    expect(() => parseContentResponse(JSON.stringify({ blok: [] }))).toThrow('Respons AI tidak berisi blok konten.');
    expect(() => parseContentResponse(JSON.stringify({ lain: 'nilai' }))).toThrow(
      'Respons AI tidak berisi blok konten.',
    );
  });

  it('melempar error kalau blok teks tidak punya markdown', () => {
    const raw = JSON.stringify({ blok: [{ tipe: 'teks', data: {} }] });
    expect(() => parseContentResponse(raw)).toThrow('bertipe teks tidak punya markdown yang valid');
  });

  it('melempar error kalau blok tabel tidak punya headers/rows yang valid', () => {
    const rawNoHeaders = JSON.stringify({ blok: [{ tipe: 'tabel', data: { rows: [] } }] });
    expect(() => parseContentResponse(rawNoHeaders)).toThrow('tidak punya headers yang valid');

    const rawBadRows = JSON.stringify({ blok: [{ tipe: 'tabel', data: { headers: ['A'], rows: 'bukan-array' } }] });
    expect(() => parseContentResponse(rawBadRows)).toThrow('tidak punya rows yang valid');
  });

  it('melempar error kalau tipe blok tidak dikenal', () => {
    const raw = JSON.stringify({ blok: [{ tipe: 'video', data: {} }] });
    expect(() => parseContentResponse(raw)).toThrow('tipe tidak dikenal: "video"');
  });

  it('parse blok chart yang valid', () => {
    const raw = JSON.stringify({
      blok: [
        {
          tipe: 'chart',
          data: { chart_type: 'bar', labels: ['A', 'B'], datasets: [{ label: 'Nilai', data: [1, 2] }] },
        },
      ],
    });
    expect(parseContentResponse(raw)).toEqual([
      { tipe: 'chart', data: { chart_type: 'bar', labels: ['A', 'B'], datasets: [{ label: 'Nilai', data: [1, 2] }] } },
    ]);
  });

  it('melempar error kalau blok chart tidak punya data chart yang valid', () => {
    const raw = JSON.stringify({ blok: [{ tipe: 'chart', data: { chart_type: 'scatter' } }] });
    expect(() => parseContentResponse(raw)).toThrow('bertipe chart tidak punya data chart yang valid');
  });

  it('parse blok diagram yang valid', () => {
    const raw = JSON.stringify({
      blok: [{ tipe: 'diagram', data: { mermaid_syntax: 'flowchart TD\nA-->B', judul: 'Alur' } }],
    });
    expect(parseContentResponse(raw)).toEqual([
      { tipe: 'diagram', data: { mermaid_syntax: 'flowchart TD\nA-->B', judul: 'Alur' } },
    ]);
  });

  it('melempar error kalau blok diagram tidak punya mermaid_syntax yang valid', () => {
    const raw = JSON.stringify({ blok: [{ tipe: 'diagram', data: { mermaid_syntax: '   ' } }] });
    expect(() => parseContentResponse(raw)).toThrow('bertipe diagram tidak punya mermaid_syntax yang valid');
  });
});

describe('generateContent', () => {
  const params = { judulBuku: 'Matematika Dasar', mapel: 'Matematika', jenjang: 'SD Kelas 4', judulBab: 'Pecahan' };

  it('memanggil generateText dengan prompt yang benar lalu parse hasilnya', async () => {
    const content = JSON.stringify({ blok: [{ tipe: 'teks', data: { markdown: 'Isi bab satu.' } }] });
    mockedGenerateText.mockImplementation(async (req) => {
      req.onChunk?.(content);
      return content;
    });

    const result = await generateContent(params, { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'test' });

    expect(result.rawResponse).toBe(content);
    expect(result.blok).toEqual([{ tipe: 'teks', data: { markdown: 'Isi bab satu.' } }]);

    const req = mockedGenerateText.mock.calls[0][0];
    expect(req.provider).toBe('deepseek');
    expect(req.model).toBe('deepseek-chat');
    expect(req.apiKey).toBe('test');
    expect(req.user).toContain('Pecahan');
    expect(req.maxTokens).toBe(8000);
  });

  it('meneruskan error dari generateText apa adanya', async () => {
    mockedGenerateText.mockRejectedValue(new Error('DeepSeek API error (401): unauthorized'));

    await expect(
      generateContent(params, { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'salah' }),
    ).rejects.toThrow('DeepSeek API error (401)');
  });

  it('melempar error kalau hasil akhir bukan JSON valid', async () => {
    mockedGenerateText.mockResolvedValue('bukan json');

    await expect(
      generateContent(params, { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'test' }),
    ).rejects.toThrow('Respons AI bukan JSON yang valid.');
  });
});
