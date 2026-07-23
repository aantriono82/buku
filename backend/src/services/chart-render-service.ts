import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface ChartDataset {
  label: string;
  data: number[];
}

export interface ChartData {
  chart_type: 'bar' | 'line' | 'pie';
  labels: string[];
  datasets: ChartDataset[];
  judul?: string;
}

export interface RenderChartOptions {
  outputDir: string;
  width?: number;
  height?: number;
  fileName?: string;
}

const CHART_TYPES = new Set(['bar', 'line', 'pie']);

export function isValidChartData(data: unknown): data is ChartData {
  const d = data as Partial<ChartData> | null;
  if (!d || typeof d !== 'object') {
    return false;
  }
  if (typeof d.chart_type !== 'string' || !CHART_TYPES.has(d.chart_type)) {
    return false;
  }
  if (!Array.isArray(d.labels) || d.labels.length === 0 || !d.labels.every((l) => typeof l === 'string')) {
    return false;
  }
  if (!Array.isArray(d.datasets) || d.datasets.length === 0) {
    return false;
  }
  return d.datasets.every(
    (ds) =>
      ds &&
      typeof ds === 'object' &&
      typeof (ds as ChartDataset).label === 'string' &&
      Array.isArray((ds as ChartDataset).data) &&
      (ds as ChartDataset).data.every((v) => typeof v === 'number'),
  );
}

export async function renderChart(data: ChartData, options: RenderChartOptions): Promise<string> {
  if (!isValidChartData(data)) {
    throw new Error('Data chart tidak valid: perlu chart_type, labels, dan datasets yang sesuai.');
  }

  const width = options.width ?? 800;
  const height = options.height ?? 600;
  const canvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  const buffer = await canvas.renderToBuffer({
    type: data.chart_type,
    data: {
      labels: data.labels,
      datasets: data.datasets,
    },
    options: {
      plugins: {
        title: { display: Boolean(data.judul), text: data.judul ?? '' },
      },
    },
  });

  await fs.mkdir(options.outputDir, { recursive: true });
  const fileName = options.fileName ?? `chart-${randomUUID()}.png`;
  const filePath = path.join(options.outputDir, fileName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}
