'use client';

import { ReactNode } from 'react';

/**
 * Shared positioning wrapper for the match page's floating bottom CTAs
 * (P2-402, run #231). The four surfaces (WhatsApp invite, Join, waitlist
 * join, waitlist queued) previously repeated the identical `fixed
 * bottom-[var(--floating-cta-bottom)] … z-40` wrapper markup inline; this
 * component is the ONE place the bottom-band contract lives, so a change to
 * the band (offset var, z rung, horizontal padding/max width) lands once.
 * Pure dedup — no behavior change.
 */
export function FloatingCta({ children }: { children: ReactNode }) {
  return (
    <div className="fixed bottom-[var(--floating-cta-bottom)] inset-x-0 max-w-md md:max-w-lg mx-auto px-5 z-40">
      {children}
    </div>
  );
}
