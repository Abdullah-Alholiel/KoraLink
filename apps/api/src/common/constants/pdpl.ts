/**
 * P0-6 (run #29) PDPL grace window — the single source of truth.
 *
 * After `deleted_at` is set, the user has this many days to call
 * POST /users/me/restore before `purgeExpiredAccounts()` (the hard-purge
 * cron) anonymizes the row.
 *
 * Consumers (run #31 resume, Reviewer A M5): UsersService (window math,
 * purge WHERE clause) and JwtCookieStrategy (the signed-`iat` restore-window
 * gate). Both MUST import from here — the strategy's comment previously said
 * "MUST mirror UsersService.PDPL_GRACE_DAYS", which was a silent-drift trap.
 */
export const PDPL_GRACE_DAYS = 30;
