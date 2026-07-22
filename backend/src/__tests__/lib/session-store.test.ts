import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSession, getSession, destroySession, clearSessionsForTest } from '../../lib/session-store.js';

describe('session-store', () => {
  beforeEach(() => {
    clearSessionsForTest();
    vi.useRealTimers();
  });

  it('membuat session dan bisa divalidasi', () => {
    const token = createSession(42);
    const session = getSession(token);
    expect(session).toEqual({ adminId: 42 });
  });

  it('mengembalikan null untuk token yang tidak dikenal', () => {
    expect(getSession('token-tidak-ada')).toBeNull();
  });

  it('mengembalikan null untuk token undefined', () => {
    expect(getSession(undefined)).toBeNull();
  });

  it('destroySession membuat token tidak valid lagi', () => {
    const token = createSession(1);
    destroySession(token);
    expect(getSession(token)).toBeNull();
  });

  it('session kedaluwarsa setelah TTL terlampaui', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = createSession(7);

    vi.setSystemTime(new Date('2026-01-01T13:00:00Z')); // 13 jam > TTL 12 jam
    expect(getSession(token)).toBeNull();
  });
});
