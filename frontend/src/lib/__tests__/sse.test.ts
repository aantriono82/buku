import { describe, it, expect } from 'vitest';
import { extractSseDataLines } from '../sse';

describe('extractSseDataLines', () => {
  it('mengekstrak satu event data lengkap dan menyisakan buffer kosong', () => {
    const { events, remainder } = extractSseDataLines('data: {"chunk":"halo"}\n\n');
    expect(events).toEqual(['{"chunk":"halo"}']);
    expect(remainder).toBe('');
  });

  it('mengekstrak beberapa event sekaligus', () => {
    const buffer = 'data: {"chunk":"a"}\n\ndata: {"chunk":"b"}\n\n';
    const { events, remainder } = extractSseDataLines(buffer);
    expect(events).toEqual(['{"chunk":"a"}', '{"chunk":"b"}']);
    expect(remainder).toBe('');
  });

  it('menyisakan baris terakhir yang belum lengkap sebagai remainder', () => {
    const buffer = 'data: {"chunk":"a"}\n\ndata: {"chunk":"b"';
    const { events, remainder } = extractSseDataLines(buffer);
    expect(events).toEqual(['{"chunk":"a"}']);
    expect(remainder).toBe('data: {"chunk":"b"');
  });

  it('mengabaikan baris [DONE]', () => {
    const { events } = extractSseDataLines('data: {"chunk":"a"}\n\ndata: [DONE]\n\n');
    expect(events).toEqual(['{"chunk":"a"}']);
  });

  it('mengabaikan baris kosong/non-data', () => {
    const { events } = extractSseDataLines('\n\ndata: {"chunk":"a"}\n\n\n');
    expect(events).toEqual(['{"chunk":"a"}']);
  });

  it('buffer kosong menghasilkan events kosong dan remainder kosong', () => {
    const { events, remainder } = extractSseDataLines('');
    expect(events).toEqual([]);
    expect(remainder).toBe('');
  });
});
