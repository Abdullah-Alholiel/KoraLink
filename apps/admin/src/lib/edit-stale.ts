/**
 * P2-192 (run #130): optimistic-edit staleness detection for admin detail pages.
 *
 * The API's guarded update() (admin/disputes.service.ts + admin/reports.service.ts)
 * rejects a race-loser save with 409 Conflict. When the client echoed `version`
 * and the row was saved-while-editing (status unchanged), the 409 body carries a
 * distinct message + the fresh version. The admin api client collapses every
 * non-OK body to `Error(body.message)`, so the page classifies on the message
 * fragment — kept in ONE helper so both surfaces (and future ones) share it.
 */
export const EDIT_STALE_MESSAGE_FRAGMENT = 'edited by another admin';

export function isStaleEditError(e: unknown): boolean {
  return e instanceof Error && e.message.includes(EDIT_STALE_MESSAGE_FRAGMENT);
}
