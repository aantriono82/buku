import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { isValidDiagramData, renderDiagram, type SpawnFn } from '../../services/diagram-render-service.js';

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'diagram-render-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function fakeSpawn(behavior: (args: readonly string[]) => Promise<{ code: number; stderr?: string }>): SpawnFn {
  return vi.fn((_command: string, args: readonly string[]) => {
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
    child.stderr = new EventEmitter();
    behavior(args).then(({ code, stderr }) => {
      if (stderr) {
        child.stderr.emit('data', Buffer.from(stderr));
      }
      child.emit('exit', code);
    });
    return child as unknown as ReturnType<SpawnFn>;
  });
}

describe('isValidDiagramData', () => {
  it('menerima mermaid_syntax non-kosong', () => {
    expect(isValidDiagramData({ mermaid_syntax: 'flowchart TD\nA-->B' })).toBe(true);
  });

  it('menolak mermaid_syntax kosong/whitespace', () => {
    expect(isValidDiagramData({ mermaid_syntax: '   ' })).toBe(false);
  });

  it('menolak data tanpa mermaid_syntax', () => {
    expect(isValidDiagramData({})).toBe(false);
    expect(isValidDiagramData(null)).toBe(false);
  });
});

describe('renderDiagram', () => {
  it('memanggil mmdc dengan argumen -i/-o yang benar dan mengembalikan file_path saat sukses', async () => {
    const outputDir = await makeTmpDir();
    let capturedArgs: readonly string[] = [];
    const spawnImpl = fakeSpawn(async (args) => {
      capturedArgs = args;
      const outIdx = args.indexOf('-o');
      await fs.writeFile(args[outIdx + 1], '<svg></svg>');
      return { code: 0 };
    });

    const filePath = await renderDiagram(
      { mermaid_syntax: 'flowchart TD\nA-->B' },
      { outputDir, fileName: 'test-diagram.svg', spawnImpl, mmdcPath: '/fake/mmdc' },
    );

    expect(filePath).toBe(path.join(outputDir, 'test-diagram.svg'));
    expect(capturedArgs[0]).toBe('-i');
    expect(capturedArgs[2]).toBe('-o');
    expect(capturedArgs[3]).toBe(filePath);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('<svg>');

    // File input sementara (.mmd) sudah dibersihkan
    const files = await fs.readdir(outputDir);
    expect(files).toEqual(['test-diagram.svg']);
  });

  it('melempar error kalau mmdc keluar dengan kode non-zero', async () => {
    const outputDir = await makeTmpDir();
    const spawnImpl = fakeSpawn(async () => ({ code: 1, stderr: 'chromium gagal dijalankan' }));

    await expect(
      renderDiagram({ mermaid_syntax: 'flowchart TD\nA-->B' }, { outputDir, spawnImpl, mmdcPath: '/fake/mmdc' }),
    ).rejects.toThrow(/mermaid-cli keluar dengan kode 1/);
  });

  it('melempar error untuk data tidak valid tanpa memanggil spawn', async () => {
    const outputDir = await makeTmpDir();
    const spawnImpl = vi.fn();

    await expect(
      renderDiagram({ mermaid_syntax: '' }, { outputDir, spawnImpl: spawnImpl as unknown as SpawnFn }),
    ).rejects.toThrow('Data diagram tidak valid');
    expect(spawnImpl).not.toHaveBeenCalled();
  });
});
