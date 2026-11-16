/**
 * Handle auto-pick (2026-11-16, cutover Card 2 — P1).
 *
 * A taken auto-derived handle must NEVER block sign-up: when the requested
 * handle already belongs to another user, pick the next free one by appending
 * a random numeric suffix and re-checking against the UNIQUE users.handle
 * column. The loop is race-safe by construction — the final truth is the
 * UNIQUE index on INSERT/UPDATE, not the pre-check; losing that race raises
 * the same ConflictException, which the caller may retry.
 *
 * Also exported: {@link slugifyHandle} — the canonical wire-safe handle
 * derivation from a display name (letters/digits/underscore, ≤ 50 chars to
 * fit the users.handle column; if a slug exceeds the column after cleaning,
 * it is truncated to leave room for up to 3 suffix digits).
 */
import { randomInt } from 'node:crypto';

export const HANDLE_MAX_LENGTH = 50;
/** Two digits of entropy ≈ 90 suffixes before adding a third digit. */
const SUFFIX_MIN = 10;
const SUFFIX_MAX = 99;
const MAX_ATTEMPTS = 30;

/** DB error carrying a PostgreSQL code (driver error or wrapped in `cause`). */
type PgCodedError = { code?: string; cause?: { code?: string } };

export function pgUniqueViolationCode(err: unknown): string | undefined {
  const coded = err as PgCodedError | undefined;
  return coded?.code ?? coded?.cause?.code;
}

/**
 * Wire-safe handle from a display name: lowercase, non-alphanumerics → '_',
 * collapsed, trimmed, truncated to fit HANDLE_MAX_LENGTH minus suffix room
 * (suffix is appended by the auto-pick, not here).
 * Returns null when nothing usable survives (e.g. an all-emoji name).
 */
export function slugifyHandle(name: string): string | null {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks (é → e)
    .replace(/[^a-z0-9_-]+/g, '_') // keep letters/digits/underscore/hyphen
    .replace(/[_-]{2,}/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');

  if (!slug) return null;

  // Leave room for '_' + up to 3 suffix digits appended by auto-pick.
  const maxBase = HANDLE_MAX_LENGTH - 4;
  return slug.length <= maxBase ? slug : slug.slice(0, maxBase);
}

export interface HandleLikeRow {
  id: string;
  handle: string | null;
}

/**
 * Pick a free handle for `userId`.
 *
 * @param requested the caller's derived/desired handle (may be taken or null)
 * @param ownsHandle true when `requested` already belongs to `userId`
 *   (re-save of the same profile must never collide with itself)
 * @param lookup db lookup — returns all rows whose handle is in the probe set
 * @param randInt injectable RNG for deterministic tests
 * @returns a handle that passed the lookup pre-check, or null when every
 *   attempt lost the UNIQUE-index race (caller may surface the conflict).
 */
export async function pickFreeHandle(
  requested: string | null,
  ownsHandle: boolean,
  lookup: (handles: string[]) => Promise<HandleLikeRow[]>,
  randInt: (min: number, max: number) => number = randomInt,
): Promise<string | null> {
  // Re-saving your own handle can never collide — keep it untouched.
  // (A null requested is never self-owned; fall through to generation.)
  if (ownsHandle && requested !== null) return requested;

  const candidates: string[] = [];
  if (requested) candidates.push(requested);
  const base = requested ? slugifyHandle(requested) : null;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const baseForSuffix = base ?? 'player';
    const suffix = randInt(SUFFIX_MIN, SUFFIX_MAX);
    candidates.push(`${baseForSuffix}_${suffix}`);
    if (i >= 4) {
      // Late attempts: widen the entropy with a 3-digit suffix.
      candidates.push(`${baseForSuffix}_${randInt(100, 999)}`);
    }
  }
  const rows = await lookup(candidates);
  const taken = new Set(rows.map((r) => r.handle));
  for (const candidate of candidates) {
    if (!taken.has(candidate)) return candidate;
  }
  return null; // every candidate lost — caller decides
}
