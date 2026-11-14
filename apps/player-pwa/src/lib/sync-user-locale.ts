/**
 * syncUserLocale (P2-264, run #168) — fire-and-forget preference write.
 *
 * When the user switches the app language (LanguageToggle), their
 * transactional-email locale should follow: payout receipts, cancellation
 * notices and verification mails render in the language THEY chose, not a
 * hardcoded market default. This helper PATCHes /users/me { locale } and is
 * deliberately fire-and-forget:
 *
 * - `keepalive: true` lets the request survive the full-page reload the
 *   toggle performs right after (navigatePreservingLocale) — without it the
 *   browser aborts in-flight fetches on unload and the preference silently
 *   never lands.
 * - 401 on pre-auth surfaces (/login header toggle) is EXPECTED — a logged-out
 *   visitor has no preference row to sync — and is swallowed along with every
 *   other failure. The UI language already switched; email locale sync is a
 *   best-effort side effect, never a blocker, and must never surface an error
 *   toast over a successful language switch.
 *
 * Hex placement: lib layer (not a component import of fetcher) — components
 * stay adapter-free per koralink-hexagonal-architecture.
 */

import { fetcher } from '@/lib/fetcher';

export type UserLocale = 'ar' | 'en';

export async function syncUserLocale(locale: UserLocale): Promise<void> {
  try {
    await fetcher<void | { locale?: string }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ locale }),
      // keepalive rides through RequestInit → fetch() in lib/fetcher.ts
      keepalive: true,
    });
  } catch {
    // silent by design — see contract comment above
  }
}
