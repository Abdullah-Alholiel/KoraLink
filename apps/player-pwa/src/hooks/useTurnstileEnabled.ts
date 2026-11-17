'use client';

/**
 * Launch-lane F1 (run #212): reads the captcha block from GET /api/v1/health.
 * The health `turnstile` field is the SINGLE enablement signal — the login
 * widget mounts only when the API actually arms + keys Turnstile, so flag-off
 * deployments download nothing and gate nothing.
 */

import { useEffect, useState } from 'react';

export interface TurnstileStatus {
  enabled: boolean;
  siteKey: string | null;
}

export function useTurnstileEnabled(): TurnstileStatus | null {
  const [status, setStatus] = useState<TurnstileStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        // Same origin resolution the fetcher uses (env or hostname:3001).
        // Raw fetch on purpose: no auth, no 401 self-heal, no breadcrumbs.
        const base =
          process.env.NEXT_PUBLIC_API_URL ??
          `http://${window.location.hostname}:3001/api/v1`;
        const res = await fetch(`${base}/health`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { turnstile?: TurnstileStatus };
        if (!cancelled && data?.turnstile) setStatus(data.turnstile);
      } catch {
        // health unreachable → leave null → widget never mounts (fail-open for
        // the WIDGET only; the SERVER still fails closed when armed).
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return status;
}
