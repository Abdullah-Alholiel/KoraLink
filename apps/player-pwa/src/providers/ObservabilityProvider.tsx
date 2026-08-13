'use client';

/**
 * Observability providers for KoraLink PWA.
 *
 * - Sentry: error tracking with React error boundary integration.
 * - PostHog: product analytics (page views, user actions).
 *
 * Both are env-gated: when NEXT_PUBLIC_SENTRY_DSN / NEXT_PUBLIC_POSTHOG_KEY
 * are empty (the default), they gracefully no-op — no network calls, no
 * crashes. This makes the observability stack safe to ship in dev without
 * configured DSNs, while production deployment just sets the env vars.
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';
import { env } from '@/env.mjs';

let posthogInitialized = false;

function initSentry() {
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // graceful no-op in dev

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
  });
}

function initPostHog() {
  const key = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // graceful no-op in dev

  posthog.init(key, {
    api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
    loaded: () => {
      posthogInitialized = true;
    },
    autocapture: false, // we emit events explicitly for control
    disable_session_recording: true,
  });
  posthogInitialized = true;
}

/**
 * Initializes Sentry + PostHog on mount.
 * Wrap the app with this provider in the root layout.
 */
export function ObservabilityProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initSentry();
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
  if (context) {
    Sentry.captureException(error, { extra: context });
  } else {
    Sentry.captureException(error);
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
  Sentry.addBreadcrumb({ message, category, level, data });
}

/**
 * Track a product analytics event with PostHog.
 * Event naming: snake_case, domain-prefixed (per AGENTS.md §4.3).
 * Safe to call anywhere — no-ops when PostHog is not configured.
 */
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!env.NEXT_PUBLIC_POSTHOG_KEY || !posthogInitialized) return;
  posthog.capture(event, properties);
}

/**
 * Identify a user in Sentry + PostHog for session correlation.
 */
export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.setUser({ id: userId, ...traits });
  }
  if (env.NEXT_PUBLIC_POSTHOG_KEY && posthogInitialized) {
    posthog.identify(userId, traits);
  }
}

/**
 * Clear user context on logout.
 */
export function clearUser() {
  if (env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.setUser(null);
  }
  if (env.NEXT_PUBLIC_POSTHOG_KEY && posthogInitialized) {
    posthog.reset();
  }
}
