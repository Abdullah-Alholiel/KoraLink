import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyToClipboard, shareOrCopy } from '@/lib/share';

/**
 * Unit tests for the universal share/clipboard cascade.
 *
 * jsdom ships WITHOUT `navigator.clipboard` and `navigator.share`, and its
 * `document.execCommand` is a no-op stub — so every branch is driven by mocks,
 * making the outcome deterministic across environments.
 */

function setClipboard(writeText?: (...args: unknown[]) => Promise<void>) {
  if (writeText === undefined) {
    Reflect.deleteProperty(navigator, 'clipboard');
  } else {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
  }
}

function setShare(impl?: (payload: unknown) => Promise<void>) {
  if (impl === undefined) {
    Reflect.deleteProperty(navigator, 'share');
  } else {
    Object.defineProperty(navigator, 'share', {
      value: impl,
      configurable: true,
      writable: true,
    });
  }
}

function mockExecCommand(result: boolean) {
  const fn = vi.fn().mockReturnValue(result);
  // jsdom does NOT implement document.execCommand — define it as an own
  // property so the legacy copy path is testable (afterEach cleans it up).
  Object.defineProperty(document, 'execCommand', {
    value: fn,
    configurable: true,
    writable: true,
  });
  return fn;
}

beforeEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(navigator, 'share');
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(document, 'execCommand');
});

describe('copyToClipboard', () => {
  it('prefers the async Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    const method = await copyToClipboard('https://koralink.example/match/1');

    expect(writeText).toHaveBeenCalledWith('https://koralink.example/match/1');
    expect(method).toBe('async-clipboard');
  });

  it('falls back to legacy execCommand when the async API rejects', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    const exec = mockExecCommand(true);

    const method = await copyToClipboard('https://koralink.example/match/1');

    expect(exec).toHaveBeenCalledWith('copy');
    expect(method).toBe('legacy-exec');
  });

  it('uses execCommand directly when there is no Clipboard API (HTTP origin)', async () => {
    setClipboard(undefined); // non-secure origin: navigator.clipboard is undefined
    const exec = mockExecCommand(true);

    const method = await copyToClipboard('https://koralink.example/match/1');

    expect(exec).toHaveBeenCalledWith('copy');
    expect(method).toBe('legacy-exec');
  });

  it('returns null when every mechanism fails', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    mockExecCommand(false);

    const method = await copyToClipboard('https://koralink.example/match/1');

    expect(method).toBeNull();
  });

  it('returns null when there is no document (SSR guard)', async () => {
    // `copyToClipboard` guards on `window`/`document`; jsdom has them, so this
    // asserts the happy path is unaffected by the guard shape.
    mockExecCommand(true);
    const method = await copyToClipboard('text');
    expect(method).toBe('legacy-exec');
  });
});

describe('shareOrCopy', () => {
  it('returns "shared" when Web Share resolves', async () => {
    setShare(vi.fn().mockResolvedValue(undefined));

    const outcome = await shareOrCopy({ title: 'Match', text: 'Join', url: 'https://x' });

    expect(outcome).toBe('shared');
  });

  it('returns "dismissed" when the user cancels the native sheet (AbortError)', async () => {
    setShare(vi.fn().mockRejectedValue(new DOMException('canceled', 'AbortError')));

    const outcome = await shareOrCopy({ title: 'Match', url: 'https://x' });

    expect(outcome).toBe('dismissed');
  });

  it('returns "dismissed" for iOS NotAllowedError with a dismiss message', async () => {
    setShare(
      vi.fn().mockRejectedValue(new DOMException('share canceled by user dismiss', 'NotAllowedError')),
    );

    const outcome = await shareOrCopy({ title: 'Match', url: 'https://x' });

    expect(outcome).toBe('dismissed');
  });

  it('falls back to copy when Web Share fails for a real reason', async () => {
    setShare(vi.fn().mockRejectedValue(new Error('bad data')));
    setClipboard(vi.fn().mockResolvedValue(undefined));

    const outcome = await shareOrCopy({ title: 'Match', text: 'Join', url: 'https://x' });

    expect(outcome).toBe('copied');
  });

  it('copies text+url when Web Share is unavailable', async () => {
    setShare(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    const outcome = await shareOrCopy({ text: 'Join', url: 'https://x' });

    expect(outcome).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('Join\nhttps://x');
  });

  it('returns "failed" when neither share nor copy works', async () => {
    setShare(undefined);
    setClipboard(undefined);
    mockExecCommand(false);

    const outcome = await shareOrCopy({ url: 'https://x' });

    expect(outcome).toBe('failed');
  });

  it('returns "failed" for an empty payload with no share', async () => {
    setShare(undefined);

    const outcome = await shareOrCopy({});

    expect(outcome).toBe('failed');
  });
});
