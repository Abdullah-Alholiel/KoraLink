import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePushNav } from '@/components/layout/PushNavHandler';

/**
 * P2-93 (run #70): unit side of the guarded notification tap. The worker
 * posts `{ type: 'kl-push-nav', url }` to a focused window; the hook must
 * soft-navigate ONLY for well-formed same-origin-inapp messages, and ignore
 * everything else (other channels can post to the same SW message bus).
 */

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('PushNavHandler usePushNav (P2-93, run #70)', () => {
  let listeners: Map<string, EventListener[]>;

  const emit = (data: unknown) => {
    for (const l of listeners.get('message') ?? []) {
      l({ data } as MessageEvent);
    }
  };

  beforeEach(() => {
    listeners = new Map();
    pushMock.mockClear();
    (navigator.serviceWorker as unknown as {
      addEventListener: (t: string, l: EventListener) => void;
      removeEventListener: (t: string, l: EventListener) => void;
    }) = {
      addEventListener: (t: string, l: EventListener) => {
        listeners.set(t, [...(listeners.get(t) ?? []), l]);
      },
      removeEventListener: (t: string, l: EventListener) => {
        listeners.set(
          t,
          (listeners.get(t) ?? []).filter((x) => x !== l),
        );
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('soft-navigates on a well-formed kl-push-nav message', () => {
    renderHook(() => usePushNav());
    emit({ type: 'kl-push-nav', url: '/ar/match/abc' });
    expect(pushMock).toHaveBeenCalledWith('/ar/match/abc');
  });

  it('ignores messages of other types', () => {
    renderHook(() => usePushNav());
    emit({ type: 'kl-other', url: '/ar/match/abc' });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('ignores non-string and off-shell URLs (defense-in-depth)', () => {
    renderHook(() => usePushNav());
    emit({ type: 'kl-push-nav', url: 'https://evil.example/ar' });
    emit({ type: 'kl-push-nav', url: 42 });
    emit({ type: 'kl-push-nav' });
    emit(null);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', () => {
    const { unmount } = renderHook(() => usePushNav());
    expect((listeners.get('message') ?? []).length).toBe(1);
    unmount();
    expect((listeners.get('message') ?? []).length).toBe(0);
  });
});
