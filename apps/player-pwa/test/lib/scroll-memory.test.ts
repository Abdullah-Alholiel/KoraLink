/**
 * Unit tests — lib/scroll-memory (scroll-position memory).
 *
 * The store is sessionStorage-backed (survives the no-bfcache document reload
 * on back navigation — proven by live E2E, run #33). Covers: save/restore
 * round-trip, per-route keys, restore missing + reset fallback, clear, reload
 * persistence, throttled writes, and null-element safety.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveScroll,
  restoreScroll,
  getRemembered,
  clearScrollMemory,
} from '@/lib/scroll-memory';

const KEY = 'koralink.scroll-memory';

function el(scrollTop: number): HTMLElement {
  const e = document.createElement('div');
  Object.defineProperty(e, 'scrollTop', {
    value: scrollTop,
    writable: true,
    configurable: true,
  });
  return e;
}

/** Flush the 500ms trailing throttle. */
function tick(ms = 550): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('scroll-memory', () => {
  beforeEach(() => {
    clearScrollMemory();
    sessionStorage.removeItem(KEY);
  });

  it('save → restore round-trips the offset for a route key', () => {
    saveScroll('/en/my-games', el(640));
    const fresh = el(0);
    restoreScroll('/en/my-games', fresh);
    expect(fresh.scrollTop).toBe(640);
  });

  it('keys positions per pathname (no cross-route bleed)', () => {
    saveScroll('/en/my-games', el(640));
    saveScroll('/en/play', el(120));
    const games = el(0);
    const play = el(0);
    restoreScroll('/en/my-games', games);
    restoreScroll('/en/play', play);
    expect(games.scrollTop).toBe(640);
    expect(play.scrollTop).toBe(120);
  });

  it('last save wins for the same key', () => {
    const node = el(100);
    saveScroll('/ar/my-games', node);
    node.scrollTop = 980;
    saveScroll('/ar/my-games', node);
    const fresh = el(0);
    restoreScroll('/ar/my-games', fresh);
    expect(fresh.scrollTop).toBe(980);
  });

  it('missing entry + resetIfMissing=true resets to top', () => {
    const fresh = el(5150);
    restoreScroll('/en/wallet', fresh, true);
    expect(fresh.scrollTop).toBe(0);
  });

  it('missing entry + resetIfMissing=false leaves position untouched', () => {
    const fresh = el(5150);
    restoreScroll('/en/wallet', fresh);
    expect(fresh.scrollTop).toBe(5150);
  });

  it('getRemembered peeks without touching an element', () => {
    expect(getRemembered('/en/my-games')).toBeUndefined();
    saveScroll('/en/my-games', el(640));
    expect(getRemembered('/en/my-games')).toBe(640);
  });

  it('clearScrollMemory wipes cache and storage', async () => {
    saveScroll('/en/my-games', el(640));
    await tick();
    expect(sessionStorage.getItem(KEY)).toContain('640');
    clearScrollMemory();
    expect(getRemembered('/en/my-games')).toBeUndefined();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('survives a simulated page reload (storage re-read)', async () => {
    saveScroll('/en/my-games', el(640));
    await tick(); // let the throttled write land
    expect(sessionStorage.getItem(KEY)).toContain('640');

    // A real document reload re-executes the module: import a FRESH instance
    // (query string busts Vite's module cache) — its in-memory cache starts
    // null, so it must re-read the position from sessionStorage.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reloaded: any = await import(
      /* @vite-ignore */ '@/lib/scroll-memory?reload=1' as any
    );
    expect(reloaded.getRemembered('/en/my-games')).toBe(640);
    const fresh = el(0);
    reloaded.restoreScroll('/en/my-games', fresh);
    expect(fresh.scrollTop).toBe(640);
  });

  it('throttles storage writes while scrolling', async () => {
    const node = el(0);
    const writeSpy = vi.spyOn(Storage.prototype, 'setItem');
    for (let i = 0; i < 20; i++) {
      node.scrollTop = i * 10;
      saveScroll('/en/my-games', node);
    }
    // Only the trailing flush should have written to storage so far (≤1).
    expect(writeSpy.mock.calls.filter(([k]) => k === KEY).length).toBeLessThanOrEqual(1);
    await tick();
    expect(writeSpy.mock.calls.filter(([k]) => k === KEY).length).toBe(1);
    expect(getRemembered('/en/my-games')).toBe(190);
    writeSpy.mockRestore();
  });

  it('null element / empty key are safe no-ops', () => {
    expect(() => saveScroll('/en/my-games', null)).not.toThrow();
    expect(() => saveScroll('', el(10))).not.toThrow();
    expect(() => restoreScroll('/en/my-games', null)).not.toThrow();
    expect(() => restoreScroll('', el(10))).not.toThrow();
  });
});
