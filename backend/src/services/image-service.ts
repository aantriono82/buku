import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface ImageProvider {
  generate(prompt: string, opts?: { size?: string }): Promise<Buffer>;
}

export interface GenerateAIOptions {
  outputDir: string;
  fileName?: string;
  size?: string;
}

export async function generateAI(provider: ImageProvider, prompt: string, options: GenerateAIOptions): Promise<string> {
  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt gambar tidak boleh kosong.');
  }

  const buffer = await provider.generate(prompt, options.size ? { size: options.size } : undefined);

  await fs.mkdir(options.outputDir, { recursive: true });
  const fileName = options.fileName ?? `gambar-${randomUUID()}.png`;
  const filePath = path.join(options.outputDir, fileName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const ALLOWED_UPLOAD_EXT = new Set(Object.values(EXT_BY_MIME));

export function extForMimeType(mimeType: string): string | null {
  return EXT_BY_MIME[mimeType] ?? null;
}

export interface UploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface SaveUploadOptions {
  outputDir: string;
  fileName?: string;
}

export async function saveUpload(file: UploadFile, options: SaveUploadOptions): Promise<string> {
  const ext = extForMimeType(file.mimetype) ?? path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_UPLOAD_EXT.has(ext)) {
    throw new Error(`Format gambar tidak didukung: ${ext || file.mimetype}. Gunakan PNG, JPG, atau WEBP.`);
  }

  await fs.mkdir(options.outputDir, { recursive: true });
  const fileName = options.fileName ?? `upload-${randomUUID()}${ext}`;
  const filePath = path.join(options.outputDir, fileName);
  await fs.writeFile(filePath, file.buffer);
  return filePath;
}
