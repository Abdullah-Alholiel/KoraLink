/**
 * Scroll-position memory for KoraLink's custom scroll containers.
 *
 * Why this exists: the (main) layout scrolls `<main class="scroll-container">`,
 * not the document. `next/navigation`'s built-in scroll restoration only manages
 * the DOCUMENT scroller — and when a route leaves the (main) group (e.g. tapping
 * a match card → `/match/[id]`, which renders its own shell), the `<main>`
 * element UNMOUNTS entirely. Coming back builds a fresh container at
 * scrollTop 0, so the user loses their swipe position.
 *
 * Store: sessionStorage (key `koralink.scroll-memory`), a flat map keyed by
 * route pathname → vertical offset.
 *
 *  - WHY sessionStorage: the live E2E proved a SPA-memory map is NOT enough —
 *    Chromium serves the back navigation as a fresh document load on this box
 *    (no bfcache in headless; iOS PWA gesture-back can behave the same), so a
 *    module map dies with the page and the restore finds nothing. sessionStorage
 *    survives the reload, is scoped to the tab (no cross-tab bleed), and is
 *    cleared by the browser when the tab closes — matching Next.js's own
 *    per-session scroll-restoration semantics.
 *  - Writes are throttled (500ms trailing) + flushed on `pagehide`, so fast
 *    swiping costs at most one write per 500ms and leaving mid-swipe never
 *    loses the last position.
 */
const STORAGE_KEY = 'koralink.scroll-memory';

interface ScrollStore {
  [pathname: string]: number;
}

let cache: ScrollStore | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function safeSession(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    // Storage can throw (private mode / disabled) — degrade to memory-only.
    return null;
  }
}

function getStore(): ScrollStore {
  if (cache) return cache;
  const ss = safeSession();
  if (ss) {
    try {
      const raw = ss.getItem(STORAGE_KEY);
      if (raw) cache = JSON.parse(raw) as ScrollStore;
    } catch {
      // Corrupted entry — start fresh rather than crash a scroll handler.
    }
  }
  cache ??= {};
  return cache;
}

/** Persist the in-memory cache. No-op when storage is unavailable. */
function flush(): void {
  const ss = safeSession();
  if (!ss) return;
  try {
    ss.setItem(STORAGE_KEY, JSON.stringify(getStore()));
  } catch {
    // Quota / serialization failure — scroll memory is best-effort.
  }
}

/** Remember `el`'s current vertical offset under `key`. Safe to call from
 *  unthrottled scroll listeners — storage writes are debounced. */
export function saveScroll(key: string, el: HTMLElement | null): void {
  if (!key || !el || typeof window === 'undefined') return;
  getStore()[key] = el.scrollTop;
  if (flushTimer) return; // trailing throttle: one write per 500ms window
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 500);
}

/** Restore `key`'s remembered offset onto `el`.
 *
 *  - `resetIfMissing`: when no entry exists for `key` (first visit to that
 *    route on a persistent container), zero the offset so the route never
 *    inherits the previous route's scroll position.
 *  - When the content shrank since the save, the browser clamps the value to
 *    the container's real max scroll — native behavior, nothing to do here.
 */
export function restoreScroll(
  key: string,
  el: HTMLElement | null,
  resetIfMissing = false,
): void {
  if (!key || !el || typeof window === 'undefined') return;
  const y = getStore()[key];
  if (y === undefined) {
    if (resetIfMissing) el.scrollTop = 0;
    return;
  }
  el.scrollTop = y;
}

/** Peek at the remembered offset without touching any element. Undefined
 *  when the route has no remembered position (first visit). */
export function getRemembered(key: string): number | undefined {
  if (!key || typeof window === 'undefined') return undefined;
  return getStore()[key];
}

/** Test/e2e helper — wipes every remembered position (cache + storage). */
export function clearScrollMemory(): void {
  cache = {};
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const ss = safeSession();
  try {
    ss?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Flush the pending throttled write when the page is being hidden or
 *  unloaded — call once from the app shell (`pagehide` covers iOS PWA). */
export function flushScrollMemoryOnHide(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('pagehide', () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flush();
  });
}
