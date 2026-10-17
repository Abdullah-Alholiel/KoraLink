import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PartnerService } from './partner.service';

/**
 * P2-3 contract specs (run #138): partner-initiated payout REQUEST.
 *
 * POST /partner/payout-requests (VenueOwner only) — creates ONE `pending`
 * settlement per venue with unsettled completed KoraLink-booked revenue:
 *   201 { requested, totalAmount, settlements:[{ id, venueId, venueName,
 *         amount, periodStart, periodEnd, status }] }
 *   400 when nothing unsettled; Admin role → 403 (generator is the admin path).
 *
 * Money rules under test: amount = server-side SQL SUM (never client input),
 * quantized numeric-text; unique (venue_id, period_start) + onConflictDoNothing
 * dedupe; FOR UPDATE venue lock inside the tx (P2-105 idiom).
 */
process.env.TZ = 'UTC';

type Inserted = Record<string, unknown>;

interface TxFixture {
  venueRows: Array<{ id: string; name: string }>;
  /** Rows the unsettled-revenue SELECT returns. */
  unsettled: Array<{ venue_id: string; amount: string }>;
}

function makeService(
  fx: TxFixture & {
    audit?: { log: (e: unknown) => Promise<void> };
    settings?: { getNumber: (key: string, fallback: number) => Promise<number> };
  },
) {
  const inserted: Inserted[] = [];
  const captured = {
    /** SQL text of the raw unsettled-revenue query. */
    rawSql: '' as string,
    /** True when the venue SELECT carried a FOR UPDATE row lock. */
    usedForUpdate: false,
    /** True when the insert ran with onConflictDoNothing. */
    conflictDoNothing: false,
  };

  const tx: any = {
    select: () => ({
      from: () => ({
        where: () => ({
          // Drizzle `.for('update')` decorates the promise; capture the marker.
          for: () => {
            captured.usedForUpdate = true;
            return Promise.resolve(fx.venueRows);
          },
        }),
      }),
    }),
    execute: async (q: { sqlChunks?: unknown[]; queryChunks?: unknown[] }) => {
      // Cheap shape capture instead of a full dialect render: the NOT-EXISTS
      // predicate + koralink/Completed filters are what the contract needs.
      const chunks = (q.queryChunks ?? []) as unknown[];
      captured.rawSql = chunks
        .map((c) => (typeof c === 'string' ? c : typeof c === 'object' ? JSON.stringify(c) : String(c)))
        .join(' ');
      return fx.unsettled;
    },
    insert: () => ({
      values: (vals: Inserted) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            captured.conflictDoNothing = true;
            const row = {
              id: `set-${inserted.length + 1}`,
              ...vals,
            };
            inserted.push(row);
            return [row];
          },
        }),
      }),
    }),
  };

  const db = {
    transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  };

  const svc = new PartnerService(
    db as never,
    { broadcastOps: () => {} } as never,
    (fx.audit ?? undefined) as never,
    (fx.settings ?? undefined) as never,
  );
  return { svc, inserted, captured };
}

describe('P2-3: POST /partner/payout-requests (partner-initiated payout request)', () => {
  it('creates one pending settlement per unsettled venue and returns the contract shape', async () => {
    const { svc, inserted, captured } = makeService({
      venueRows: [
        { id: 'v1', name: 'Riyadh Arena' },
        { id: 'v2', name: 'Jeddah Court' },
      ],
      unsettled: [
        { venue_id: 'v1', amount: '1234.50' },
        { venue_id: 'v2', amount: '88.00' },
      ],
    });
    const res = await svc.requestPayout('owner-1', 'VenueOwner');

    expect(res.requested).toBe(2);
    expect(res.totalAmount).toBe('1322.50');
    expect(res.settlements).toHaveLength(2);
    for (const s of res.settlements) {
      expect(s.status).toBe('pending');
      expect(typeof s.amount).toBe('string');
      expect(s.periodStart).toBe(s.periodEnd);
      expect(typeof s.venueName).toBe('string');
    }
    // Money never rides the request body — server-derived only.
    expect(inserted).toHaveLength(2);
    expect(inserted.every((r) => r.status === 'pending'));

    // Race guards: FOR UPDATE on the venue rows + conflict-do-nothing insert.
    expect(captured.usedForUpdate).toBe(true);
    expect(captured.conflictDoNothing).toBe(true);
  });

  it('the unsettled-revenue query filters to completed koralink bookings with the NOT-EXISTS guard', async () => {
    const { svc, captured } = makeService({
      venueRows: [{ id: 'v1', name: 'A' }],
      unsettled: [{ venue_id: 'v1', amount: '50.00' }],
    });
    await svc.requestPayout('owner-1', 'VenueOwner');
    expect(captured.rawSql).toContain('Completed');
    expect(captured.rawSql).toContain('koralink');
    expect(captured.rawSql).toContain('NOT EXISTS');
    expect(captured.rawSql).toContain('settlements');
    // P2-211: the window + dedupe guard ride the payout_cadence_days setting
    // (mirrors the admin generator) — no 365-day hardcode, and both bound
    // params are the SAME rolling instant.
    expect(captured.rawSql).not.toContain('365 days');
    const stamps =
      captured.rawSql.match(/20\d{2}-\d{2}-\d{2}T[\d:]+(\.\d+)?Z?/g) ?? [];
    expect(stamps.length).toBe(2);
    const [windowStart, guardStart] = stamps;
    if (!windowStart || !guardStart) throw new Error('expected two window timestamps in SQL');
    expect(windowStart).toBe(guardStart);
  });

  it('window follows payout_cadence_days — mirrors the admin generator, 7-day fallback', async () => {
    const t0 = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // No settings service (legacy spec construction) → documented 7-day fallback.
    const fallback = makeService({
      venueRows: [{ id: 'v1', name: 'A' }],
      unsettled: [{ venue_id: 'v1', amount: '50.00' }],
    });
    await fallback.svc.requestPayout('owner-1', 'VenueOwner');

    // Cadence overridden to 14 → the money window widens to match the generator.
    const override = makeService({
      venueRows: [{ id: 'v1', name: 'A' }],
      unsettled: [{ venue_id: 'v1', amount: '50.00' }],
      settings: { getNumber: async (key, fb) => (key === 'payout_cadence_days' ? 14 : fb) },
    });
    await override.svc.requestPayout('owner-1', 'VenueOwner');
    const t1 = Date.now();

    const stampOf = (cap: { rawSql: string }): number => {
      const s = cap.rawSql.match(/20\d{2}-\d{2}-\d{2}T[\d:]+(\.\d+)?Z?/g) ?? [];
      const stamp = s.find(Boolean);
      if (!stamp) throw new Error('expected a rolling-window timestamp in captured SQL');
      return Date.parse(stamp.endsWith('Z') ? stamp : `${stamp}Z`);
    };
    const mid = (t0 + t1) / 2;
    // Fallback window ≈ now-7d (±10 min test-execution slack).
    expect(Math.abs(stampOf(fallback.captured) - (mid - 7 * day))).toBeLessThan(10 * 60 * 1000);
    // Override window ≈ now-14d, i.e. strictly older than the fallback window.
    expect(Math.abs(stampOf(override.captured) - (mid - 14 * day))).toBeLessThan(10 * 60 * 1000);
    expect(stampOf(override.captured)).toBeLessThan(stampOf(fallback.captured) - 5 * day);
  });

  it('400 with nothing unsettled (zero-revenue venues)', async () => {
    const { svc } = makeService({
      venueRows: [{ id: 'v1', name: 'A' }],
      unsettled: [],
    });
    await expect(svc.requestPayout('owner-1', 'VenueOwner')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('400 when the partner owns no venues', async () => {
    const { svc } = makeService({ venueRows: [], unsettled: [] });
    await expect(svc.requestPayout('owner-1', 'VenueOwner')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('Admin role is refused (the generator is the admin path)', async () => {
    const { svc } = makeService({ venueRows: [], unsettled: [] });
    await expect(svc.requestPayout('admin-1', 'Admin')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('conflict-dropped duplicates do not count as requested (400 when all dropped)', async () => {
    const { svc } = makeService({
      venueRows: [{ id: 'v1', name: 'A' }],
      unsettled: [{ venue_id: 'v1', amount: '50.00' }],
    });
    // Force the conflict path: returning() yields nothing on a dropped insert.
    const anySvc = svc as unknown as { db: { transaction: (fn: (t: unknown) => Promise<unknown>) => Promise<unknown> } };
    anySvc.db.transaction = async (fn) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => Promise.resolve([{ id: 'v1', name: 'A' }]),
            }),
          }),
        }),
        execute: async () => [{ venue_id: 'v1', amount: '50.00' }],
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({ returning: async () => [] }),
          }),
        }),
      });
    await expect(svc.requestPayout('owner-1', 'VenueOwner')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
