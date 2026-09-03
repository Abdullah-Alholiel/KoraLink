/**
 * Unit tests — hooks/useScrollMemory.
 *
 * Verifies the hook wires save-on-scroll + restore-on-revisit onto the
 * returned ref across unmount/remount at the same pathname — the My Games →
 * match detail → back regression (run #33).
 *
 * jsdom implements `scrollTop` natively (stores the assigned value) — do NOT
 * defineProperty it after render: an own-property shadow CLOBBERS the value
 * the layout effect already restored (settles the "held" check) and the test
 * then reads its own 0 (this exact false negative cost a debug round).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor, fireEvent } from '@testing-library/react';
import { useScrollMemory } from '@/hooks/useScrollMemory';
import { clearScrollMemory } from '@/lib/scroll-memory';

let mockPathname = '/en/my-games';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

function Host() {
  const ref = useScrollMemory<HTMLElement>();
  return <main ref={ref} data-testid="scroller" />;
}

describe('useScrollMemory', () => {
  beforeEach(() => {
    mockPathname = '/en/my-games';
    clearScrollMemory();
  });

  it('saves on scroll and restores after unmount → remount on same route', async () => {
    // 1) First visit: user swipes down to 880px. The save is deferred a
    //    frame — flush it before "navigating away".
    const first = render(<Host />);
    const scroller = first.getByTestId('scroller');
    scroller.scrollTop = 880;
    fireEvent.scroll(scroller);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    first.unmount();

    // 2) Route change unmounts the container (e.g. opened match detail),
    //    then back: a fresh container remounts at the same pathname.
    const second = render(<Host />);
    const fresh = second.getByTestId('scroller');
    await waitFor(() => expect(fresh.scrollTop).toBe(880));
    second.unmount();
  });

  it('cleanup saves the live position; teardown collapse cannot poison', async () => {
    // Real-world order (run #33 live E2E): React runs layout-phase cleanups
    // BEFORE touching the DOM, so the cleanup authoritatively saves the live
    // position; the collapse (scrollTop clamp to 0 + scroll event) happens
    // AFTER the listener is removed and must never overwrite it.
    const first = render(<Host />);
    const scroller = first.getByTestId('scroller');
    scroller.scrollTop = 880;
    fireEvent.scroll(scroller);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    first.unmount(); // ← authoritative save happens here, at scrollTop 880

    // Post-cleanup collapse: container empties, scrollTop clamps to 0, a
    // scroll event fires on the (now removed) node.
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });

    // The remembered position must be the live 880, not the collapse 0.
    const second = render(<Host />);
    const fresh = second.getByTestId('scroller');
    await waitFor(() => expect(fresh.scrollTop).toBe(880));
    second.unmount();
  });

  it('mounts at the top on a route never visited (no stale restore)', async () => {
    // Memory holds a position for my-games only.
    await saveFor('/en/my-games', 880);

    mockPathname = '/en/wallet';
    const { getByTestId, unmount } = render(<Host />);
    // Layout effect resets routes with no remembered position to the top
    // (lib-level reset is covered in scroll-memory.test.ts).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(getByTestId('scroller').scrollTop).toBe(0);
    unmount();
  });

  it('keeps per-route positions isolated across route switches', async () => {
    await saveFor('/en/my-games', 880);
    await saveFor('/en/play', 240);

    mockPathname = '/en/play';
    const first = render(<Host />);
    await waitFor(() =>
      expect(first.getByTestId('scroller').scrollTop).toBe(240),
    );
    first.unmount();

    mockPathname = '/en/my-games';
    const second = render(<Host />);
    await waitFor(() =>
      expect(second.getByTestId('scroller').scrollTop).toBe(880),
    );
    second.unmount();
  });

  it('re-applies the offset until content is tall enough (late data)', async () => {
    await saveFor('/en/my-games', 880);

    // Simulate the real-browser race at PROTOTYPE level (own-property shadows
    // would clobber the hook's writes — see file header): at first paint the
    // list is SHORT, so every scrollTop assignment clamps to 0.
    const proto = Element.prototype as unknown as {
      scrollTop: number;
    };
    const original = Object.getOwnPropertyDescriptor(proto, 'scrollTop');
    let maxScroll = 0;
    let value = 0;
    Object.defineProperty(proto, 'scrollTop', {
      configurable: true,
      get: () => value,
      set: (v: number) => {
        value = Math.min(v, maxScroll);
      },
    });

    try {
      const { getByTestId, unmount } = render(<Host />);
      const scroller = getByTestId('scroller');

      // "React Query data arrives" 400ms in — the list becomes tall.
      const grow = setTimeout(() => {
        maxScroll = 20_000;
      }, 400);

      // The settle loop must keep re-applying until the content holds 880.
      await waitFor(() => expect(scroller.scrollTop).toBe(880), {
        timeout: 3_000,
      });
      clearTimeout(grow);
      unmount();
    } finally {
      if (original) Object.defineProperty(proto, 'scrollTop', original);
    }
  });
});

/** Helper: mount at `path`, scroll to `y`, unmount — simulates a visit. */
async function saveFor(path: string, y: number): Promise<void> {
  mockPathname = path;
  const { getByTestId, unmount } = render(<Host />);
  const el = getByTestId('scroller');
  el.scrollTop = y;
  fireEvent.scroll(el);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  unmount();
}
