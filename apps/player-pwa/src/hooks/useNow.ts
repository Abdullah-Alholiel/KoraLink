'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe wall clock for render-path time comparisons (POTM voting windows,
 * countdowns). Returns `null` during server render AND the first client
 * render — identical on both sides, so hydration can never mismatch — and the
 * real `Date.now()` from the first effect onward.
 *
 * NEVER call `Date.now()` directly in a component's render path: the server's
 * clock and the device's clock disagree, and React 19 surfaces that as a
 * hydration error when the value flips a visible branch (MatchCard vote CTA,
 * my-games grouping — Reviewer A, run #40).
 *
 * Consumers must decide their pre-mount posture explicitly:
 * - window-open comparisons → treat `null` as open (optimistic; the API
 *   re-validates authoritatively on submit);
 * - deadline-elapsed comparisons → treat `null` as not-yet-elapsed.
 */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);
  return now;
}
