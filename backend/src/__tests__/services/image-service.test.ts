import { describe, it, expect, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { generateAI, saveUpload, extForMimeType, type ImageProvider } from '../../services/image-service.js';

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-service-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('generateAI', () => {
  it('memanggil provider.generate lalu simpan buffer ke file', async () => {
    const outputDir = await makeTmpDir();
    const provider: ImageProvider = { generate: vi.fn().mockResolvedValue(Buffer.from('fake-png-bytes')) };

    const filePath = await generateAI(provider, 'ilustrasi fotosintesis daun', {
      outputDir,
      fileName: 'gambar-1.png',
    });

    expect(filePath).toBe(path.join(outputDir, 'gambar-1.png'));
    expect(provider.generate).toHaveBeenCalledWith('ilustrasi fotosintesis daun', undefined);

    const buffer = await fs.readFile(filePath);
    expect(buffer.toString()).toBe('fake-png-bytes');
  });

  it('meneruskan opsi size ke provider.generate', async () => {
    const outputDir = await makeTmpDir();
    const provider: ImageProvider = { generate: vi.fn().mockResolvedValue(Buffer.from('x')) };

    await generateAI(provider, 'prompt', { outputDir, size: '1024x1024' });

    expect(provider.generate).toHaveBeenCalledWith('prompt', { size: '1024x1024' });
  });

  it('melempar error kalau prompt kosong, tidak memanggil provider', async () => {
    const outputDir = await makeTmpDir();
    const provider: ImageProvider = { generate: vi.fn() };

    await expect(generateAI(provider, '   ', { outputDir })).rejects.toThrow('Prompt gambar tidak boleh kosong.');
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('meneruskan error dari provider apa adanya, tidak menulis file', async () => {
    const outputDir = await makeTmpDir();
    const provider: ImageProvider = { generate: vi.fn().mockRejectedValue(new Error('Gemini Image API error (429)')) };

    await expect(generateAI(provider, 'prompt', { outputDir })).rejects.toThrow('Gemini Image API error (429)');
    const files = await fs.readdir(outputDir);
    expect(files).toHaveLength(0);
  });
});

describe('extForMimeType', () => {
  it('memetakan mime type gambar yang didukung', () => {
    expect(extForMimeType('image/png')).toBe('.png');
    expect(extForMimeType('image/jpeg')).toBe('.jpg');
    expect(extForMimeType('image/webp')).toBe('.webp');
  });

  it('mengembalikan null untuk mime type tidak dikenal', () => {
    expect(extForMimeType('application/pdf')).toBeNull();
  });
});

describe('saveUpload', () => {
  it('menyimpan file upload PNG yang valid', async () => {
    const outputDir = await makeTmpDir();
    const filePath = await saveUpload(
      { buffer: Buffer.from('data-gambar'), mimetype: 'image/png', originalname: 'ilustrasi.png' },
      { outputDir, fileName: 'upload-1.png' },
    );

    expect(filePath).toBe(path.join(outputDir, 'upload-1.png'));
    const buffer = await fs.readFile(filePath);
    expect(buffer.toString()).toBe('data-gambar');
  });

  it('menolak mime type yang tidak didukung, tidak menulis file', async () => {
    const outputDir = await makeTmpDir();

    await expect(
      saveUpload({ buffer: Buffer.from('x'), mimetype: 'application/pdf', originalname: 'file.pdf' }, { outputDir }),
    ).rejects.toThrow('Format gambar tidak didukung');

    const files = await fs.readdir(outputDir);
    expect(files).toHaveLength(0);
  });

  it('menghasilkan nama file unik berekstensi sesuai mime type kalau fileName tidak diisi', async () => {
    const outputDir = await makeTmpDir();
    const filePath = await saveUpload(
      { buffer: Buffer.from('x'), mimetype: 'image/webp', originalname: 'apa-saja.txt' },
      { outputDir },
    );

    expect(path.extname(filePath)).toBe('.webp');
  });
});
