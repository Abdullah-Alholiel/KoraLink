/**
 * P2-111 (run #81): a match lobby's chat is a pre-game/lineup coordination
 * surface — once the match reaches a TERMINAL state, or its scheduled window
 * has run past the end while the match is NOT actively in progress, no
 * further messages are accepted. Shared by the REST `sendMessage` and the WS
 * `send-message` handler so both surfaces enforce the identical predicate.
 *
 * Rule:
 * - Completed / Cancelled (persisted) → closed (host action or dispute path).
 * - InProgress past its scheduled end (overtime) → OPEN — the players are
 *   still on the pitch coordinating; the terminal write closes chat later.
 * - Open/Full past end (expired or underfill-cancelled) → closed; this
 *   matches resolveEffectiveStatus, which derives a terminal status for
 *   exactly this class of rows.
 */
export const TERMINAL_CHAT_STATUSES: readonly string[] = ['Completed', 'Cancelled'];

/**
 * Stable machine code for the chat-closed rejection (P1-47 pattern): the API
 * error body carries `code` so the PWA can render authored, localized copy
 * (what happened + why + what to do next) instead of raw backend strings.
 */
export const CHAT_CLOSED_ERROR_CODE = 'MATCH_CHAT_CLOSED';

/** True when the match must not accept further chat messages. */
export function isChatClosed(match: {
  status: string;
  scheduled_at: Date;
  duration_mins: number;
}): boolean {
  if (TERMINAL_CHAT_STATUSES.includes(match.status)) return true;
  // Unknown/clock-less row → fail open (chat stays available; a terminal
  // status above still closes it regardless of the clock).
  if (match.status === 'InProgress') return false;
  if (!(match.scheduled_at instanceof Date) || !match.duration_mins) return false;
  const endMs = match.scheduled_at.getTime() + match.duration_mins * 60 * 1000;
  return Date.now() >= endMs;
}
