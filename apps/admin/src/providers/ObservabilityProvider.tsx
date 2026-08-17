'use client';

/**
 * Observability for the KoraLink admin console.
 *
 * - Sentry: error tracking. Initialized in `sentry.client.config.ts` (auto-loaded
 *   by @sentry/nextjs). Session replay is disabled — admin data is sensitive.
 * - PostHog: product analytics, lazily initialized here.
 *
 * Both are env-gated: when NEXT_PUBLIC_SENTRY_DSN / NEXT_PUBLIC_POSTHOG_KEY are
 * empty they gracefully no-op.
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

type PostHog = {
  init: (key: string, opts: Record<string, unknown>) => void;
  capture: (event: string, props?: Record<string, unknown>) => void;
  identify: (id: string, traits?: Record<string, unknown>) => void;
  reset: () => void;
};

let posthogInstance: PostHog | null = null;
let posthogInitialized = false;

async function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === 'undefined') return;
  try {
    const { default: posthog } = await import('posthog-js');
    posthogInstance = posthog as PostHog;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      autocapture: false,
      disable_session_recording: true,
    });
    posthogInitialized = true;
  } catch {
    // Graceful fallback if PostHog fails to load
  }
}

export function ObservabilityProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return <>{children}</>;
}

export function captureError(error: Error | unknown, context?: Record<string, unknown>) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  try {
    if (context) Sentry.captureException(error, { extra: context });
    else Sentry.captureException(error);
  } catch {
    // never throw from an error reporter
  }
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !posthogInitialized || !posthogInstance) return;
  posthogInstance.capture(event, properties);
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      Sentry.setUser({ id: userId, ...traits });
    } catch {
      // ignore
    }
  }
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY && posthogInitialized && posthogInstance) {
    posthogInstance.identify(userId, traits);
  }
}

export function clearUser() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      Sentry.setUser(null);
    } catch {
      // ignore
    }
  }
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY && posthogInitialized && posthogInstance) {
    posthogInstance.reset();
  }
}
