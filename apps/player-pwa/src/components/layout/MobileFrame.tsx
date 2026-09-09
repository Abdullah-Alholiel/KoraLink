'use client';

import type { ReactNode } from 'react';

interface MobileFrameProps {
  children: ReactNode;
  className?: string;
}

/**
 * THE app shell — every screen renders inside this frame.
 *
 * HARD RULE (Abdullah, 2026-09-09): nothing may ever surpass the main screen
 * box — this is a mobile-first PWA. Two layers enforce it:
 *  1. `min-w-0` on the inner box: it is a flex item, so without it its
 *     `min-width:auto` floor would let ONE wide child (long i18n string,
 *     non-shrinking CTA) force the whole frame wider than the viewport —
 *     iOS Safari then zooms out to fit the overflow and the app renders
 *     tiny/offset (the "Host a Match" pill bug). With min-w-0, `w-full
 *     max-w-6xl` governs and inner overflow stays impossible to mistake
 *     for page width.
 *  2. `overflow-hidden` on both boxes clips any escaping paint as a last
 *     resort. Components must still scroll WITHIN their own boxes
 *     (.scroll-container) — clipping is a guard, not a layout strategy.
 */
export default function MobileFrame({ children, className = '' }: MobileFrameProps) {
  return (
    <div className="w-full h-[var(--app-height)] max-h-[var(--app-height)] bg-brand-bg flex justify-center overflow-hidden">
      <div
        className={`
          w-full max-w-6xl
          h-[var(--app-height)] max-h-[var(--app-height)]
          bg-white shadow-sm
          relative overflow-hidden
          flex flex-col flex-1
          min-w-0
          ${className}
        `}
      >
        {children}
      </div>
    </div>
  );
}
