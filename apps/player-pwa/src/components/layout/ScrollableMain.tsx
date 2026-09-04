'use client';

import { useEffect, type ReactNode } from 'react';
import { useScrollMemory } from '@/hooks/useScrollMemory';
import { flushScrollMemoryOnHide } from '@/lib/scroll-memory';

/**
 * The (main) layout's scroll container. Client component so the swipe
 * position survives route changes (lib/scroll-memory): Next.js only restores
 * the document scroller, and this element unmounts when a route leaves the
 * (main) group — e.g. My Games list → /match/[id] → back used to reset the
 * list to the top.
 *
 * Also flushes any pending (throttled) scroll-memory write on pagehide, so
 * back/forward document reloads (no bfcache) restore the exact position.
 */
export default function ScrollableMain({ children }: { children: ReactNode }) {
  const scrollRef = useScrollMemory<HTMLElement>();

  useEffect(() => flushScrollMemoryOnHide(), []);

  return (
    <main
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto scroll-container bg-brand-bg"
    >
      {children}
    </main>
  );
}
