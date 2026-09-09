'use client';

/**
 * Observability providers for KoraLink PWA.
 *
 * - Sentry: error tracking. Initialized in `sentry.client.config.ts` (auto-loaded
 *   by @sentry/nextjs); the helpers below are thin, env-gated wrappers.
 * - PostHog: product analytics (page views, user actions). Initialized lazily here.
 *
 * Both are env-gated: when NEXT_PUBLIC_SENTRY_DSN / NEXT_PUBLIC_POSTHOG_KEY are
 * empty (the default), they gracefully no-op — no network calls, no crashes.
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { env } from '@/env.mjs';

let posthogInstance: typeof import('posthog-js').default | null = null;
let posthogInitialized = false;

/**
 * A malformed NEXT_PUBLIC_POSTHOG_HOST (e.g. a markdown-wrapped paste like
 * "[https://us.i.posthog.com](…)" — shipped to prod 2026-09-09 and baked into
 * every chunk) makes posthog-js treat it as a RELATIVE path and POST analytics
 * to our own origin (404 noise, silent analytics loss). Validate the shape;
 * fall back to the SDK default on anything that isn't a clean https origin.
 */
function safePostHogHost(): string {
  const raw = env.NEXT_PUBLIC_POSTHOG_HOST;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && (url.pathname === '/' || url.pathname === '')) {
      return url.origin;
    }
    return 'https://app.posthog.com';
  } catch {
    return 'https://app.posthog.com';
  }
}

/** Exported for tests (test/providers/safe-posthog-host.test.ts). */
export { safePostHogHost };

async function initPostHog() {
  const key = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === 'undefined') return;

  try {
    const { default: posthog } = await import('posthog-js');
    posthogInstance = posthog;
    posthog.init(key, {
      api_host: safePostHogHost(),
      loaded: () => {
        posthogInitialized = true;
      },
      autocapture: false,
      disable_session_recording: true,
    });
    posthogInitialized = true;
  } catch {
    // Graceful fallback if PostHog bundle fails to load
  }
}

/**
 * Initializes PostHog on mount via dynamic import when env vars are present.
 * Wrap the app with this provider in the root layout.
 */
export function ObservabilityProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return <>{children}</>;
}

// ─── Public API (safe to call even when uninitialised) ───

/**
 * Capture an error with Sentry context.
 * Safe to call anywhere — no-ops when Sentry is not configured.
 */
export function captureError(error: Error | unknown, context?: Record<string, unknown>) {
  if (!env.NEXT_PUBLIC_SENTRY_DSN) return;
  try {
    if (context) {
      Sentry.captureException(error, { extra: context });
    } else {
      Sentry.captureException(error);
    }
  } catch {
    // never throw from an error reporter
  }
}

/**
 * Add a Sentry breadcrumb for debugging error trails.
 */
export function addBreadcrumb(
  message: string,
  category: string,
  level: 'info' | 'warning' | 'error' = 'info',
  data?: Record<string, unknown>,
) {
  if (!env.NEXT_PUBLIC_SENTRY_DSN) return;
  try {
    Sentry.addBreadcrumb({ message, category, level, data });
  } catch {
    // ignore
  }
}

/**
 * Track a product analytics event with PostHog.
 * Event naming: snake_case, domain-prefixed (per AGENTS.md §4.3).
 * Safe to call anywhere — no-ops when PostHog is not configured.
 */
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!env.NEXT_PUBLIC_POSTHOG_KEY || !posthogInitialized || !posthogInstance) return;
  posthogInstance.capture(event, properties);
}

/**
 * Identify a user in Sentry + PostHog for session correlation.
 */
export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      Sentry.setUser({ id: userId, ...traits });
    } catch {
      // ignore
    }
  }
  if (env.NEXT_PUBLIC_POSTHOG_KEY && posthogInitialized && posthogInstance) {
    posthogInstance.identify(userId, traits);
  }
}

/**
 * Clear user context on logout.
 */
export function clearUser() {
  if (env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      Sentry.setUser(null);
    } catch {
      // ignore
    }
  }
  if (env.NEXT_PUBLIC_POSTHOG_KEY && posthogInitialized && posthogInstance) {
    posthogInstance.reset();
  }
}
