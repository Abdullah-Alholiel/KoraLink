'use client';

/**
 * Cloudflare Turnstile widget (launch-lane F1, run #212).
 *
 * Explicit rendering (window.turnstile.render) — the script tag lives in the
 * root layout (deferred; zero cost when the API never arms the flag). The
 * component mounts ONLY when GET /health advertises
 * `turnstile.enabled === true`, so a flag-off deployment never downloads,
 * renders, or gates anything (dead-widget risk eliminated by contract).
 *
 * Contract: onToken(token | null) — null on expiry/error/removal, so the
 * parent disables submit until a fresh token exists (a stale token is
 * single-use and would 400 CAPTCHA_INVALID server-side).
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      theme?: 'light' | 'dark' | 'auto';
      language?: string;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    onloadTurnstileCallback?: () => void;
  }
}

export interface TurnstileProps {
  siteKey: string;
  onToken: (token: string | null) => void;
  /** ISO-639-1 locale of the surrounding page ('ar' | 'en'). */
  language?: string;
}

export function Turnstile({ siteKey, onToken, language }: TurnstileProps) {
  const t = useTranslations('turnstile');
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(
    () => typeof window !== 'undefined' && !!window.turnstile,
  );
  // Keep the latest callbacks in refs so the render options never go stale
  // (the widget is rendered ONCE; props may change across re-renders).
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  // Wait for the deferred loader script (root layout) to define window.turnstile.
  useEffect(() => {
    if (scriptReady) return;
    const id = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(id);
        setScriptReady(true);
      }
    }, 250);
    // Give up after ~15s: the widget stays hidden and submit stays disabled —
    // the error copy names the fix (retry), never a silent dead form.
    const timeout = window.setTimeout(() => window.clearInterval(id), 15_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(timeout);
    };
  }, [scriptReady]);

  // Render once the API is available; tear down on unmount.
  useEffect(() => {
    if (!scriptReady || !hostRef.current || widgetIdRef.current !== null) return;
    const widgetId = window.turnstile!.render(hostRef.current, {
      sitekey: siteKey,
      callback: (token: string) => onTokenRef.current(token),
      'expired-callback': () => onTokenRef.current(null),
      'error-callback': () => onTokenRef.current(null),
      theme: 'light',
      language: language === 'ar' ? 'ar' : 'en',
    });
    widgetIdRef.current = widgetId;
    return () => {
      try {
        window.turnstile?.remove(widgetId);
      } catch {
        // already removed by navigation/remount — nothing to do
      }
      widgetIdRef.current = null;
    };
  }, [scriptReady, siteKey, language]);

  return (
    <div
      className="mt-4 w-full flex justify-center"
      data-testid="turnstile-widget"
    >
      <div ref={hostRef} className="min-h-[44px]" aria-label={t('label')} />
    </div>
  );
}
