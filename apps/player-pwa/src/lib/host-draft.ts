'use client';

/**
 * P2-281 M-3 — local draft recovery for the host form.
 *
 * A crash / tab discard mid-hosting used to lose every keystroke: the form
 * kept its state in component-local useState only. The draft persists the
 * shared text fields (title, match type, gender, date, time, duration) to
 * localStorage after every change and restores them on the next mount, with
 * an explicit "discard" affordance on the restored banner.
 *
 * Deliberately NOT persisted: venue / pitch / slot selection. Those carry
 * booking intent (partner pools, live slot availability) that goes stale —
 * the host re-picks them in a fresh session. A club-calendar `?date=` query
 * param also wins over the draft's date (fresh intent beats stale intent).
 *
 * This module is the storage seam ONLY — no React. HostMatchForm owns the
 * restore-on-mount / save-on-change / clear-on-publish wiring.
 *
 * NOTE (hex): the option unions below mirror components/host/MatchDetailsForm's
 * exported lists. lib must not import components, so the mirror is checked by
 * test/structure/host-draft-recovery.test.ts (both locales + union parity).
 */

const DRAFT_KEY = 'koralink_host_draft_v1';

/** Draft older than this is dropped, not restored (stale intent). */
export const HOST_DRAFT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const HOST_DRAFT_GENDERS = ['Men Only', 'Women Only', 'Mixed'] as const;
export const HOST_DRAFT_MATCH_TYPES = ['Casual', 'Competitive'] as const;

export type HostDraftGender = (typeof HOST_DRAFT_GENDERS)[number];
export type HostDraftMatchType = (typeof HOST_DRAFT_MATCH_TYPES)[number];

export interface HostDraft {
  title: string;
  matchType: HostDraftMatchType;
  genderRule: HostDraftGender;
  /** 'YYYY-MM-DD' (Riyadh key) or '' */
  date: string;
  /** 'HH:MM' or '' */
  time: string;
  duration: number;
  /** Match visibility at the time of the draft. */
  visibility: 'public' | 'private';
  savedAt: number;
}

export type HostDraftInput = Omit<HostDraft, 'savedAt'>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** True when the object is shape-valid; anything unexpected → false. */
function isValidDraft(value: unknown): value is HostDraft {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.title === 'string' &&
    d.title.length <= 255 &&
    (HOST_DRAFT_MATCH_TYPES as readonly string[]).includes(String(d.matchType)) &&
    (HOST_DRAFT_GENDERS as readonly string[]).includes(String(d.genderRule)) &&
    (d.date === '' || (typeof d.date === 'string' && DATE_RE.test(d.date))) &&
    (d.time === '' || (typeof d.time === 'string' && TIME_RE.test(d.time))) &&
    typeof d.duration === 'number' &&
    Number.isFinite(d.duration) &&
    [30, 45, 60, 90, 120].includes(d.duration) &&
    (d.visibility === 'public' || d.visibility === 'private') &&
    typeof d.savedAt === 'number' &&
    Number.isFinite(d.savedAt)
  );
}

/** Read + validate the draft. Corrupt / stale / shape-invalid → null. */
export function loadHostDraft(now: number = Date.now()): HostDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidDraft(parsed)) return null;
    if (now - parsed.savedAt > HOST_DRAFT_MAX_AGE_MS) return null;
    // An all-empty draft is not a draft.
    if (!parsed.title && !parsed.date && !parsed.time) return null;
    return parsed;
  } catch {
    // Private mode / quota / corrupt JSON — degrade to "no draft".
    return null;
  }
}

/** Persist the current fields. Best-effort — storage failures are silent. */
export function saveHostDraft(draft: HostDraftInput, now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: now }));
  } catch {
    // Private mode / quota — the form keeps working, just without recovery.
  }
}

/** Remove the draft (publish success / explicit discard). Best-effort. */
export function clearHostDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to recover from a storage failure here.
  }
}
