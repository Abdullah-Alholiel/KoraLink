'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown> | void;
  children: ReactNode;
  /** Pull distance (px) required to trigger. Default 70. */
  threshold?: number;
}

/**
 * Touch pull-to-refresh wrapper (US9). Uses the scroll container's parent
 * touch events; only engages when the wrapped content is scrolled to the
 * top. Shows a progress indicator while pulling and a spinner while
 * refreshing. Falls back gracefully on desktop (no touch → no-op).
 */
export default function PullToRefresh({ onRefresh, children, threshold = 70 }: PullToRefreshProps) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Only start tracking when the scroll container is at the top.
    const scroller = (e.currentTarget as HTMLElement).closest('.scroll-container');
    if (scroller && scroller.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current == null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      pulling.current = true;
      // Rubber-band: diminishing resistance after threshold.
      setPull(Math.min(delta * 0.5, threshold * 1.6));
    }
  }, [refreshing, threshold]);

  const onTouchEnd = useCallback(async () => {
    if (startY.current == null) return;
    const shouldRefresh = pull >= threshold && !refreshing;
    startY.current = null;
    setPull(0);
    if (shouldRefresh) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
  }, [pull, threshold, refreshing, onRefresh]);

  const progress = Math.min(pull / threshold, 1);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Pull indicator */}
      {(pull > 0 || refreshing) && (
        <div
          className="flex items-center justify-center transition-[height] duration-150 overflow-hidden"
          style={{ height: refreshing ? 44 : pull }}
        >
          {refreshing ? (
            <Loader2 className="w-5 h-5 text-brand-green animate-spin" strokeWidth={2} />
          ) : (
            <ArrowDown
              className="w-5 h-5 text-brand-green transition-transform duration-100"
              strokeWidth={2}
              style={{ transform: `rotate(${progress * 180}deg)` }}
            />
          )}
        </div>
      )}
      {children}
    </div>
  );
}
