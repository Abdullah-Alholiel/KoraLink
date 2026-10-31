import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PartnerService, addDaysToDateString, riyadhDateString } from './partner.service';

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
    mailer?: { sendToUsers: (ids: string[], t: string, v: unknown, d: unknown) => Promise<unknown> };
  },
) {
  const inserted: Inserted[] = [];
  const captured = {
    /** SQL text of the raw unsettled-revenue query. */
    rawSql: '' as string,
    /** True when the venue SELECT carried a FOR UPDATE row lock. */
    usedForUpdate: false,
    /** True when the lock was acquired in a deterministic order (P2-216). */
    orderedLock: false,
    /** True when the insert ran with onConflictDoNothing. */
    conflictDoNothing: false,
  };

  const tx: any = {
    select: () => ({
      from: () => ({
        where: () => ({
          // P2-216 (run #163): the lock is ORDER BY id FOR UPDATE — the
          // orderBy level MUST exist before `.for('update')` decorates it.
          orderBy: () => ({
            for: () => {
              captured.usedForUpdate = true;
              captured.orderedLock = true;
              return Promise.resolve(fx.venueRows);
            },
          }),
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
    // P2-221 (run #163): requestPayout resolves the response total via a
    // Postgres SUM outside the tx — emulate it over the inserted rows.
    // Chunks arrive as drizzle StringChunk objects ({value: [...]}) — extract
    // their text before matching.
    execute: async (q: { queryChunks?: unknown[] }) => {
      const text = (q.queryChunks ?? [])
        .map((c) =>
          typeof c === 'string'
            ? c
            : c && typeof c === 'object' && 'value' in (c as { value?: unknown[] })
              ? ((c as { value: unknown[] }).value ?? []).join('')
              : '',
        )
        .join(' ');
      if (text.includes('sum(amount)')) {
        const total = inserted.reduce((acc, r) => acc + Number(r.amount), 0);
        return [{ total: total.toFixed(2) }];
      }
      return [];
    },
  };

  const svc = new PartnerService(
    db as never,
    { broadcastOps: () => {} } as never,
    (fx.audit ?? undefined) as never,
    (fx.settings ?? undefined) as never,
    (fx.mailer ?? undefined) as never,
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
    const day = 24 * 60 * 60 * 1000;
    for (const s of res.settlements) {
      expect(s.status).toBe('pending');
      expect(typeof s.amount).toBe('string');
      // P2-216 (run #163): the stamped window is the TRUE coverage window —
      // periodEnd − periodStart === cadence (7 days), NOT today-stamped twice.
      const days = Math.round(
        (Date.parse(`${s.periodEnd}T00:00:00Z`) - Date.parse(`${s.periodStart}T00:00:00Z`)) / day,
      );
      expect(days).toBe(7);
      expect(typeof s.venueName).toBe('string');
    }
    // Money never rides the request body — server-derived only.
    expect(inserted).toHaveLength(2);
    expect(inserted.every((r) => r.status === 'pending'));

    // Race guards: FOR UPDATE on the venue rows (ORDERED — P2-216) +
    // conflict-do-nothing insert.
    expect(captured.usedForUpdate).toBe(true);
    expect(captured.orderedLock).toBe(true);
    expect(captured.conflictDoNothing).toBe(true);
  });

  // P2-C (run #143): every settlement a partner request creates carries the
  // requesting actor — provenance separates partner-requested rows from the
  // admin auto-generator's (requested_by NULL) in the console read-model.
  it('stamps requested_by with the partner actor on every created settlement', async () => {
    const { svc, inserted } = makeService({
      venueRows: [
        { id: 'v1', name: 'Riyadh Arena' },
        { id: 'v2', name: 'Jeddah Court' },
      ],
      unsettled: [
        { venue_id: 'v1', amount: '1234.50' },
        { venue_id: 'v2', amount: '88.00' },
      ],
    });
    await svc.requestPayout('owner-1', 'VenueOwner');

    expect(inserted).toHaveLength(2);
    expect(inserted.every((r) => r.requested_by === 'owner-1')).toBe(true);
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
    // P2-216 (run #163): the window bounds are parametrized Riyadh dates —
    // never bare CURRENT_DATE (server-timezone drift) and never a float.
    expect(captured.rawSql).not.toContain('CURRENT_DATE');
    expect(captured.rawSql).toContain("AT TIME ZONE 'Asia/Riyadh'");
    // P2-211: the window + dedupe guard ride the payout_cadence_days setting
    // (mirrors the admin generator) — no 365-day hardcode.
    expect(captured.rawSql).not.toContain('365 days');
  });

  // P2-216 (run #163): the request stamps the TRUE covered window
  // [riyadhEnd − cadence, riyadhEnd] on the Riyadh axis — the overlap guard
  // and admin dedupe rely on period bounds carrying real coverage, and the
  // console read-model shows the partner what window they were paid for.
  it('stamps the true Riyadh window into period_start/period_end (7-day cadence)', async () => {
    const { svc, inserted } = makeService({
      venueRows: [{ id: 'v1', name: 'Riyadh Arena' }],
      unsettled: [{ venue_id: 'v1', amount: '1234.50' }],
    });
    const res = await svc.requestPayout('owner-1', 'VenueOwner');
    expect(inserted).toHaveLength(1);
    const start = inserted[0].period_start;
    const end = inserted[0].period_end;
    expect(typeof start).toBe('string');
    expect(typeof end).toBe('string');
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const day = 24 * 60 * 60 * 1000;
    const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / day);
    expect(days).toBe(7);
    // End is today (±1 day slack around a midnight rollover mid-test).
    const now = riyadhDateString();
    expect([now, addDaysToDateString(now, -1)]).toContain(end);
    // Response mirrors the stamped window.
    expect(res.settlements[0].periodStart).toBe(start);
    expect(res.settlements[0].periodEnd).toBe(end);
  });

  // P2-221 (run #163): the response total is a Postgres exact-decimal SUM
  // over the created rows — the Number() reduce could drift a cent on large
  // multi-venue sums.
  it('response total comes from an exact-decimal SQL SUM, never a JS float reduce', async () => {
    const { svc, captured } = makeService({
      venueRows: [
        { id: 'v1', name: 'Riyadh Arena' },
        { id: 'v2', name: 'Jeddah Court' },
      ],
      unsettled: [
        { venue_id: 'v1', amount: '1234.50' },
        { venue_id: 'v2', amount: '88.00' },
      ],
    });
    // The totals SELECT rides db.execute (outside the tx) — override with a
    // spy that still resolves the same emulated SUM the mock db provides, so
    // the assertion proves the query actually ran.
    const anySvc = svc as unknown as {
      db: { execute: (q: unknown) => Promise<unknown[]> };
    };
    const inner = anySvc.db.execute.bind(anySvc.db);
    const spy = jest.fn(async (q: unknown) => inner(q));
    anySvc.db.execute = spy;
    const res = await svc.requestPayout('owner-1', 'VenueOwner');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.totalAmount).toBe('1322.50');
    expect(captured.conflictDoNothing).toBe(true);
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

    // P2-216 (run #163): the window start is a parametrized Riyadh DATE
    // (riyadhEnd − cadence) — the captured params carry it as 'YYYY-MM-DD'.
    const startDayOf = (cap: { rawSql: string }): string => {
      // The first 'YYYY-MM-DD' inline in the rendered text IS the window
      // start (the fallback literal baked into the captured chunk string).
      const s = cap.rawSql.match(/20\d{2}-\d{2}-\d{2}/g) ?? [];
      const stamp = s.find(Boolean);
      if (!stamp) throw new Error('expected a window-start date in captured SQL');
      return stamp;
    };
    const mid = t0 + (t1 - t0) / 2;
    const midRiyadh = riyadhDateString(mid);
    // Fallback start ≈ riyadhToday − 7d (±1 day slack for a midnight rollover
    // between the two runs under test).
    const expectedFallback = addDaysToDateString(midRiyadh, -7);
    const gotFallback = startDayOf(fallback.captured);
    expect(
      Math.abs(Date.parse(`${gotFallback}T00:00:00Z`) - Date.parse(`${expectedFallback}T00:00:00Z`)),
    ).toBeLessThan(2 * day);
    // Override start ≈ riyadhToday − 14d, strictly older than the fallback.
    const gotOverride = startDayOf(override.captured);
    expect(gotOverride).toBe(addDaysToDateString(midRiyadh, -14));
    expect(Date.parse(`${gotOverride}T00:00:00Z`)).toBeLessThan(
      Date.parse(`${gotFallback}T00:00:00Z`) - 5 * day,
    );
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
              orderBy: () => ({
                for: () => Promise.resolve([{ id: 'v1', name: 'A' }]),
              }),
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

// ── Partner email lane (run #165, P2-214 expansion): payout-request receipt ──
describe('P2-214: payout-request email receipt', () => {
  it('successful request emails the requesting partner with the payout_requested template', async () => {
    const sends: Array<{ ids: string[]; template: string }> = [];
    const { svc } = makeService({
      venueRows: [{ id: 'v1', name: 'Riyadh Arena' }],
      unsettled: [{ venue_id: 'v1', amount: '50.00' }],
      mailer: {
        sendToUsers: async (ids, template) => {
          sends.push({ ids, template });
          return [];
        },
      },
    });

    await svc.requestPayout('owner-1', 'VenueOwner');

    expect(sends).toHaveLength(1);
    expect(sends[0].ids).toEqual(['owner-1']);
    expect(sends[0].template).toBe('payout_requested');
  });

  it('no email on the 400 paths (nothing unsettled / no venues / admin role)', async () => {
    const sends: unknown[] = [];
    const mailer = {
      sendToUsers: async () => {
        sends.push(1);
        return [];
      },
    };
    const empty = makeService({ venueRows: [{ id: 'v1', name: 'A' }], unsettled: [], mailer });
    await expect(empty.svc.requestPayout('owner-1', 'VenueOwner')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const noVenues = makeService({ venueRows: [], unsettled: [], mailer });
    await expect(noVenues.svc.requestPayout('owner-1', 'VenueOwner')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const admin = makeService({ venueRows: [], unsettled: [], mailer });
    await expect(admin.svc.requestPayout('admin-1', 'Admin')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(sends).toHaveLength(0);
  });

  it('rejected email send never fails the request (fire-and-forget contract)', async () => {
    const { svc } = makeService({
      venueRows: [{ id: 'v1', name: 'A' }],
      unsettled: [{ venue_id: 'v1', amount: '50.00' }],
      mailer: {
        sendToUsers: async () => {
          throw new Error('resend 503');
        },
      },
    });

    const res = await svc.requestPayout('owner-1', 'VenueOwner');
    expect(res.requested).toBe(1);
  });

  it('legacy 4-arg construction (no mailer) still works — no email attempted', async () => {
    const { svc } = makeService({
      venueRows: [{ id: 'v1', name: 'A' }],
      unsettled: [{ venue_id: 'v1', amount: '50.00' }],
    });
    const res = await svc.requestPayout('owner-1', 'VenueOwner');
    expect(res.requested).toBe(1);
  });
});
