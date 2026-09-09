import { describe, it, expect, vi } from 'vitest';

// env.mjs parses process.env ONCE at import (zod singleton), so tests drive
// the value through a mocked module with a mutable holder instead.
const state = vi.hoisted(() => ({ host: 'https://app.posthog.com' }));

vi.mock('@/env.mjs', () => ({
  env: {
    get NEXT_PUBLIC_POSTHOG_HOST() {
      return state.host;
    },
  },
}));

import { safePostHogHost } from '@/providers/ObservabilityProvider';

/**
 * Regression tests for the wrapped-paste guard (prod incident 2026-09-09):
 * a markdown-wrapped NEXT_PUBLIC_POSTHOG_HOST baked into the chunks made
 * posthog-js POST /flags to our own origin (404) instead of PostHog.
 * safePostHogHost must accept clean https origins and fall back to the SDK
 * default for anything malformed.
 */
describe('safePostHogHost', () => {
  it('accepts clean https hosts', () => {
    for (const host of [
      'https://app.posthog.com',
      'https://us.i.posthog.com',
      'https://us-assets.i.posthog.com',
    ]) {
      state.host = host;
      expect(safePostHogHost()).toBe(host);
    }
  });

  it('falls back on the markdown-wrapped paste shape', () => {
    state.host = '[https://us.i.posthog.com](https://us.i.posthog.com)';
    expect(safePostHogHost()).toBe('https://app.posthog.com');
  });

  it('falls back on hosts with a path (proxy subtrees are not origins)', () => {
    state.host = 'https://example.com/ingest';
    expect(safePostHogHost()).toBe('https://app.posthog.com');
  });

  it('falls back on http and garbage', () => {
    state.host = 'http://us.i.posthog.com';
    expect(safePostHogHost()).toBe('https://app.posthog.com');

    state.host = 'not a url';
    expect(safePostHogHost()).toBe('https://app.posthog.com');
  });
});
