'use client';

// ─────────────────────────────────────────────────────────────────────────────
// BlockedCard (P1-47, run #56) — localized blocked-account surface.
//
// A banned or suspended account used to hit a raw English API string with no
// reason and no next step. The API now sends stable codes (ACCOUNT_BANNED /
// ACCOUNT_SUSPENDED / ACCOUNT_DELETED), classifyError maps them to the
// 'banned' | 'suspended' | 'deleted' kinds, and this card renders the
// error-message-standard copy: what happened + why + what to do next, EN+AR.
//
// Suspension end dates format through lib/format.ts (Gregorian-guarded ar-SA,
// Arabic-Indic numerals) — never a bare toLocaleString (Hijri/host-locale
// drift, P2-64 lesson).
// ─────────────────────────────────────────────────────────────────────────────

import { useTranslations } from 'next-intl';
import type { JSX } from 'react';
import {
  formatShortDate,
  formatShortTime,
  type AppLocale,
} from '@/lib/format';

export type BlockedReason = 'banned' | 'suspended' | 'deleted';

/**
 * Extracts a suspension end instant from an API error message.
 * Matches the exact production shape (`Account suspended until
 * 2026-09-20T14:30:00.000Z.` — the Z suffix is part of the match, so a UTC
 * instant is NOT re-interpreted as local, which would shift Riyadh renders
 * by +3h) plus lenient variants for manual admin inputs (bare date,
 * space-separated). Returns an ISO string or null when absent/malformed.
 */
export function extractSuspendedUntil(message: unknown): string | null {
  if (typeof message !== 'string') return null;
  const m = message.match(
    /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?Z?)?/,
  );
  if (!m) return null;
  const raw = m[0].replace(' ', 'T');
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const ICONS: Record<BlockedReason, JSX.Element> = {
  banned: (
    // Block/shield icon — permanent.
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-9 w-9 text-red-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
      />
    </svg>
  ),
  suspended: (
    // Clock icon — temporary, with an end date.
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-9 w-9 text-amber-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  deleted: (
    // Trash icon — scheduled for deletion; restore is the escape.
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-9 w-9 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  ),
};

interface BlockedCardProps {
  reason: BlockedReason;
  /** ISO end-of-suspension instant; renders only for `suspended`. */
  suspendedUntil?: string | null;
  /** Active locale — dates format via lib/format.ts (Riyadh, Gregorian-guarded). */
  locale: AppLocale;
  /** Sign-out handler (clears auth + returns to login). */
  onSignOut: () => void;
}

export default function BlockedCard({
  reason,
  suspendedUntil,
  locale,
  onSignOut,
}: BlockedCardProps): JSX.Element {
  const t = useTranslations('blocked');

  const until = reason === 'suspended' ? extractSuspendedUntil(suspendedUntil) : null;
  const untilDate = until ? new Date(until) : null;

  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
        {ICONS[reason]}
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-brand-black">{t('title')}</h1>
        <p className="text-sm font-medium text-gray-700">
          {t(`${reason}Title`)}
        </p>
        {reason === 'suspended' && untilDate ? (
          <p className="text-sm leading-relaxed text-gray-500">
            {t('suspendedBody', {
              date: `${formatShortDate(untilDate, locale)} ${formatShortTime(untilDate, locale)}`,
            })}
          </p>
        ) : reason === 'suspended' ? (
          <p className="text-sm leading-relaxed text-gray-500">
            {t('suspendedBodyNoDate')}
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-gray-500">
            {t(`${reason}Body`)}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="w-full rounded-lg bg-brand-green px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 active:opacity-75"
      >
        {t('signOut')}
      </button>
    </div>
  );
}
