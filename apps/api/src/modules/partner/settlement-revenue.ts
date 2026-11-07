/**
 * P2-216 (run #163): THE settlement money-source query — one definition
 * shared by the partner payout request (PartnerService.requestPayout) and the
 * admin generator (AdminSettlementsService.generatePending), so the two paths
 * cannot drift on window bounds or dedupe semantics. Pure SQL builder: no
 * Nest, no DB access, no table objects — trivially importable from both
 * modules and rendered verbatim in specs via PgDialect.
 *
 * Window (Riyadh business axis, computed in JS — no DB-server-timezone
 * assumption): [riyadhEnd − cadenceDays, riyadhEnd + 1 day). Both bounds ride
 * bound params instead of bare CURRENT_DATE, which silently follows the
 * Postgres server's timezone (the mixed-axis class P2-216 was filed for).
 *
 * Dedupe guard is an INTERVAL OVERLAP test, not a single-bound compare: a
 * past settlement whose [period_start, period_end] window intersects
 * [startDay, riyadhEnd] blocks the venue. Overlap is invariant to which
 * calendar axis a legacy row was keyed on (UTC generator rows, Riyadh partner
 * rows, or a different cadence read), closing the double-window class.
 *
 * Venue scoping is by explicit id list — the caller holds the FOR UPDATE lock
 * on exactly these rows (partner: its own venues; admin: every venue, locked
 * by the IN(pitches) pre-select). Amount is a Postgres exact decimal string
 * (P2-4) — never a float.
 */
import { SQL, sql } from 'drizzle-orm';
import { addDaysToDateString } from '../../common/utils/riyadh-date';

export interface SettlementRevenueQueryOpts {
  /** Venue ids the caller has locked FOR UPDATE. */
  venueIds: string[];
  /** Payout cadence in days (PlatformSetting payout_cadence_days). */
  cadenceDays: number;
  /** Riyadh calendar day (YYYY-MM-DD) the window ends on, inclusive. */
  riyadhEnd: string;
}

export function buildSettlementRevenueQuery(opts: SettlementRevenueQueryOpts): SQL {
  const startDay = addDaysToDateString(opts.riyadhEnd, -opts.cadenceDays);
  const endExclusive = addDaysToDateString(opts.riyadhEnd, 1);
  // Empty venue list = ALL venues (admin generator: the tx already holds a
  // FOR UPDATE lock on every venue with pitches, so no id filter is needed —
  // an `IN ()` would be a syntax error). Partner path always passes its
  // locked venue ids explicitly.
  const venueFilter = opts.venueIds.length
    ? sql`v.id IN (${sql.join(
        opts.venueIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql`TRUE`;
  return sql`
    SELECT
      v.id AS venue_id,
      COALESCE(SUM(m.pitch_cost_sar), 0)::numeric(12,2)::text AS amount
    FROM venues v
    INNER JOIN pitches p ON p.venue_id = v.id
    INNER JOIN matches m ON m.pitch_id = p.id
    WHERE ${venueFilter}
      AND m.status = 'Completed'
      AND m.booking_mode = 'koralink'
      AND m.scheduled_at >= (${startDay}::date::timestamp AT TIME ZONE 'Asia/Riyadh')
      AND m.scheduled_at < (${endExclusive}::date::timestamp AT TIME ZONE 'Asia/Riyadh')
      AND NOT EXISTS (
        SELECT 1 FROM settlements s
        WHERE s.venue_id = v.id
          AND s.period_start <= ${opts.riyadhEnd}::date
          AND s.period_end >= ${startDay}::date
      )
    GROUP BY v.id
    HAVING COALESCE(SUM(m.pitch_cost_sar), 0) > 0
  `;
}
