'use client';

import { useEffect } from 'react';

/**
 * Measures the real viewport height and stores it in the `--app-height` CSS
 * variable, which the app shell uses instead of `100dvh`.
 *
 * On iOS, `100dvh` resolves to the viewport *minus* the status bar / Safari
 * toolbar, leaving a blank strip below the bottom nav. `window.innerHeight`
 * is the layout viewport (full screen with `viewport-fit=cover`), so the shell
 * fills the physical screen and the safe-area insets handle the notch / home
 * indicator via `pt-[var(--top-safe-inset)]` / `pb-safe`.
 */
export default function ViewportHeight() {
  useEffect(() => {
    const setHeight = () => {
      document.documentElement.style.setProperty(
        '--app-height',
        `${window.innerHeight}px`,
      );
    };

    setHeight();
    window.addEventListener('resize', setHeight);
    window.addEventListener('orientationchange', setHeight);
    window.visualViewport?.addEventListener('resize', setHeight);

    return () => {
      window.removeEventListener('resize', setHeight);
      window.removeEventListener('orientationchange', setHeight);
      window.visualViewport?.removeEventListener('resize', setHeight);
    };
  }, []);

  return null;
}
