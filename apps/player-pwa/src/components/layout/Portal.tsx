'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Renders children into `document.body` via a React portal.
 *
 * THE rule for iOS overlays: any `position: fixed` overlay that must paint
 * above bottom sheets (dialogs, confirm modals, toasts, banners) MUST be
 * portaled to `document.body`. Rendering `fixed` elements inline inside a
 * page's `scroll-container` (`-webkit-overflow-scrolling: touch`) traps them
 * in that element's stacking context on iOS WebKit — they end up BELOW
 * body-level sheets (invisible + untappable) even with a huge z-index.
 *
 * Enforced by `test/structure/no-unportaled-overlays.test.ts`.
 */
export default function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(children, document.body);
}
