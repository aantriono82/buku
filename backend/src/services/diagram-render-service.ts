import { spawn, type ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

export interface DiagramData {
  mermaid_syntax: string;
  judul?: string;
}

export type SpawnFn = (command: string, args: readonly string[]) => ChildProcess;

export interface RenderDiagramOptions {
  outputDir: string;
  format?: 'svg' | 'png';
  fileName?: string;
  mmdcPath?: string;
  spawnImpl?: SpawnFn;
}

export function isValidDiagramData(data: unknown): data is DiagramData {
  const d = data as Partial<DiagramData> | null;
  return Boolean(d && typeof d === 'object' && typeof d.mermaid_syntax === 'string' && d.mermaid_syntax.trim());
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MMDC_PATH = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'mmdc');

function runMmdc(spawnFn: SpawnFn, mmdcPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(mmdcPath, args);
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`mermaid-cli keluar dengan kode ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
      }
    });
  });
}

export async function renderDiagram(data: DiagramData, options: RenderDiagramOptions): Promise<string> {
  if (!isValidDiagramData(data)) {
    throw new Error('Data diagram tidak valid: perlu mermaid_syntax yang berisi teks.');
  }

  await fs.mkdir(options.outputDir, { recursive: true });
  const format = options.format ?? 'svg';
  const fileName = options.fileName ?? `diagram-${randomUUID()}.${format}`;
  const outputPath = path.join(options.outputDir, fileName);
  const inputPath = path.join(options.outputDir, `${randomUUID()}.mmd`);

  await fs.writeFile(inputPath, data.mermaid_syntax, 'utf-8');

  try {
    await runMmdc(options.spawnImpl ?? spawn, options.mmdcPath ?? DEFAULT_MMDC_PATH, [
      '-i',
      inputPath,
      '-o',
      outputPath,
    ]);
  } finally {
    await fs.unlink(inputPath).catch(() => {});
  }

  return outputPath;
}
