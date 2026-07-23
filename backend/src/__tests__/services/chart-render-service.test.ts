import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { isValidChartData, renderChart, type ChartData } from '../../services/chart-render-service.js';

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chart-render-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('isValidChartData', () => {
  it('menerima data chart bar yang valid', () => {
    const data: ChartData = {
      chart_type: 'bar',
      labels: ['A', 'B'],
      datasets: [{ label: 'Nilai', data: [1, 2] }],
    };
    expect(isValidChartData(data)).toBe(true);
  });

  it('menolak chart_type yang tidak dikenal', () => {
    expect(isValidChartData({ chart_type: 'scatter', labels: ['A'], datasets: [{ label: 'x', data: [1] }] })).toBe(
      false,
    );
  });

  it('menolak kalau labels kosong', () => {
    expect(isValidChartData({ chart_type: 'bar', labels: [], datasets: [{ label: 'x', data: [1] }] })).toBe(false);
  });

  it('menolak kalau datasets punya data non-numerik', () => {
    expect(
      isValidChartData({ chart_type: 'line', labels: ['A'], datasets: [{ label: 'x', data: ['bukan angka'] }] }),
    ).toBe(false);
  });

  it('menolak data null/bukan objek', () => {
    expect(isValidChartData(null)).toBe(false);
    expect(isValidChartData('string')).toBe(false);
  });
});

describe('renderChart', () => {
  it('menghasilkan file PNG untuk data valid', async () => {
    const outputDir = await makeTmpDir();
    const filePath = await renderChart(
      {
        chart_type: 'bar',
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [{ label: 'Penjualan', data: [10, 20, 15] }],
        judul: 'Grafik Penjualan',
      },
      { outputDir, fileName: 'test-chart.png' },
    );

    expect(filePath).toBe(path.join(outputDir, 'test-chart.png'));
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(0);

    const buffer = await fs.readFile(filePath);
    // PNG magic bytes
    expect(buffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('melempar error untuk data tidak valid, tidak menulis file', async () => {
    const outputDir = await makeTmpDir();
    await expect(
      renderChart({ chart_type: 'pie', labels: [], datasets: [] } as unknown as ChartData, { outputDir }),
    ).rejects.toThrow('Data chart tidak valid');

    const files = await fs.readdir(outputDir);
    expect(files).toHaveLength(0);
  });
});
