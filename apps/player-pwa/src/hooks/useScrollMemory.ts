'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { usePathname } from 'next/navigation';
import {
  saveScroll,
  restoreScroll,
  getRemembered,
} from '@/lib/scroll-memory';

/** Isomorphic layout effect: pre-paint restore in the browser (no flash of
 *  wrong offset), no useLayoutEffect-on-server React warning during SSR. */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** rAF fallback for non-visual environments (jsdom test env). */
const scheduleFrame = (fn: () => void): number =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(fn)
    : (setTimeout(fn, 0) as unknown as number);
const cancelFrame = (handle: number): void => {
  if (typeof requestAnimationFrame === 'function') cancelAnimationFrame(handle);
  else clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
};

/** How long the restore loop keeps trying before giving up. Covers the
 *  React Query data-arrival window on a cold-ish return navigation. */
const SETTLE_TIMEOUT_MS = 8_000;
/** Poll cadence while waiting for the content to become tall enough. */
const SETTLE_TICK_MS = 250;
/** Consecutive on-target ticks before the position counts as stable. A
 *  single on-target tick is NOT enough — late reflows can snap the container
 *  back after one successful restore. */
const SETTLE_STABLE_TICKS = 2;
/** After a navigation intent (link tap / back), route teardown may collapse
 *  the container (content unmounts, scrollTop clamps to 0 and FIRES a scroll
 *  event while the element is still connected — Next.js suspends the outgoing
 *  page mid-transition). Saves are ignored for this window; the position was
 *  already captured at intent time, while the DOM was intact. */
const TEARDOWN_WINDOW_MS = 1_500;

/**
 * Remembers the scroll position of a persistent scroll container across route
 * changes, keyed by pathname, and restores it when the route is revisited —
 * including browser back from a route OUTSIDE the (main) layout group
 * (e.g. My Games → tap a match → /match/[id] → back).
 *
 * Attach the returned ref to the element that ACTUALLY scrolls. In the (main)
 * group that is the layout's `<main class="scroll-container">` (see
 * `components/layout/ScrollableMain`) — not the page roots, whose inner
 * `overflow-y-auto` divs have no height constraint and never scroll.
 *
 * Why not built-in restoration: `next/navigation` only manages the DOCUMENT
 * scroller, and this container unmounts when a route leaves its layout group.
 *
 * Restore protocol (every rule earned the hard way — run #33 live E2E):
 *  1. Pre-paint restore, then a settle loop that RE-APPLIES the remembered
 *     offset until it holds for SETTLE_STABLE_TICKS consecutive ticks. Async
 *     data (React Query) often mounts content AFTER first paint — a short
 *     list clamps `scrollTop` below the target.
 *  2. While settling, scroll events do NOT save (they would record transient
 *     resets). Any real user interaction (touch / wheel / keys) cancels the
 *     loop and hands scroll ownership straight back.
 *  3. Teardown poison guard: leaving the route collapses the container —
 *     content unmounts, scrollTop clamps to 0 and a scroll event fires on the
 *     STILL-CONNECTED node (Next.js suspends the outgoing page mid-flight),
 *     which would overwrite the remembered value with 0. Countermeasure: a
 *     capture-phase listener marks navigation intent (link tap inside the
 *     container, or popstate), saves the intact position IMMEDIATELY, and
 *     scroll saves are ignored for TEARDOWN_WINDOW_MS. Layout-cleanup saves
 *     are suppressed inside the window for the same reason.
 */
export function useScrollMemory<
  T extends HTMLElement = HTMLElement,
>(): RefObject<T | null> {
  const pathname = usePathname() ?? '';
  const ref = useRef<T | null>(null);
  const settlingRef = useRef(false);
  const teardownUntilRef = useRef(0);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    settlingRef.current = false;

    // ── Navigation intent: capture the intact position NOW. ──
    const markNavigationIntent = () => {
      if (settlingRef.current) return;
      if (Date.now() >= teardownUntilRef.current) {
        saveScroll(pathname, el); // DOM is still intact at click time
      }
      teardownUntilRef.current = Date.now() + TEARDOWN_WINDOW_MS;
    };
    const onCaptureClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.('a[href]') && el.contains(target)) {
        markNavigationIntent();
      }
    };
    const onPopstate = () => markNavigationIntent();
    document.addEventListener('click', onCaptureClick, true);
    window.addEventListener('popstate', onPopstate);

    // ── Track the user's position while swiping. ──
    let pending = 0;
    const onScroll = () => {
      // Transient restore resets AND route-teardown collapses must never
      // poison the remembered value — only live swipes save via events.
      if (settlingRef.current) return;
      if (Date.now() < teardownUntilRef.current) return; // collapse guard
      cancelFrame(pending);
      pending = scheduleFrame(() => {
        if (el.isConnected) saveScroll(pathname, el);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    // ── Restore before paint, then settle until the offset holds stable. ──
    restoreScroll(pathname, el, true);

    let stableTicks = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let rafHandle = 0;

    const stopSettling = () => {
      settlingRef.current = false;
      el.removeEventListener('pointerdown', stopForUser);
      el.removeEventListener('touchstart', stopForUser);
      el.removeEventListener('wheel', stopForUser);
      el.removeEventListener('keydown', stopForUser);
    };
    // The settle window must never fight a real swipe: the first genuine
    // interaction cancels it and returns scroll ownership to the user.
    const stopForUser = () => stopSettling();
    el.addEventListener('pointerdown', stopForUser, { passive: true });
    el.addEventListener('touchstart', stopForUser, { passive: true });
    el.addEventListener('wheel', stopForUser, { passive: true });
    el.addEventListener('keydown', stopForUser);

    if (getRemembered(pathname) !== undefined) {
      settlingRef.current = true;
      const startedAt = Date.now();
      const settle = () => {
        const node = ref.current;
        if (!node || !settlingRef.current) return; // unmounted / user took over
        const target = getRemembered(pathname);
        if (target === undefined) {
          stopSettling();
          return; // route forgot — nothing to hold
        }
        restoreScroll(pathname, node, true);
        stableTicks = node.scrollTop >= target ? stableTicks + 1 : 0;
        if (stableTicks >= SETTLE_STABLE_TICKS) {
          stopSettling();
          return; // held stable — content tall enough, no late resets
        }
        if (Date.now() - startedAt > SETTLE_TIMEOUT_MS) {
          stopSettling();
          return; // give up (content genuinely shorter than the offset)
        }
        timer = setTimeout(() => {
          rafHandle = scheduleFrame(settle);
        }, SETTLE_TICK_MS);
      };
      settle();
    }

    return () => {
      cancelFrame(pending);
      el.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onCaptureClick, true);
      window.removeEventListener('popstate', onPopstate);
      // Authoritative save at teardown — BUT never inside the teardown
      // window: by then the content may already be suspended (scrollTop 0),
      // and the intact value was captured at intent time.
      if (Date.now() >= teardownUntilRef.current && !settlingRef.current) {
        saveScroll(pathname, el);
      }
      // If a restore was still settling, keep the remembered value as-is —
      // the in-flight position may be a transient retry state.
      stopSettling();
      if (timer) clearTimeout(timer);
      cancelFrame(rafHandle);
    };
  }, [pathname]);

  return ref;
}
