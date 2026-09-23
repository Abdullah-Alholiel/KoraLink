import { MatchesService } from './matches.service';
import { riyadhDateKey, riyadhTimeNow } from '../../common/utils/riyadh';

/**
 * getPitchSlots past-slot filter (owner directive 2026-09-18):
 *  - a PAST date (before the Riyadh day) → [] without querying the DB;
 *  - TODAY → the generated SQL carries `start_time > <riyadh now>` so slots
 *    whose start has passed never leave the database;
 *  - FUTURE dates → no time filter (full day listed).
 * Riyadh is the product's canonical timezone (mirrors the PWA's
 * lib/venue-hours.ts). These specs pin the generated SQL via PgDialect so
 * the filter cannot silently regress to the unfiltered form.
 */
describe('MatchesService.getPitchSlots — past-slot filter', () => {
  const PITCH_ID = 'pitch-1';

  function makeDb() {
    const queries: string[] = [];
    const params: unknown[] = [];
    const db = {
      select: () => ({
        from: () => {
          const builder: any = {};
          builder.where = (clause: unknown) => {
            // Render the composed WHERE through the real dialect so the
            // assertion sees exactly what Postgres would run (params
            // included — the time filter binds, it does not inline).
            const { PgDialect } = require('drizzle-orm/pg-core');
            const rendered = new PgDialect().sqlToQuery(clause as never);
            queries.push(rendered.sql);
            params.push(...rendered.params);
            return builder;
          };
          builder.orderBy = async () => [];
          return builder;
        },
      }),
    };
    return { db, queries, params };
  }

  function makeService(db: unknown) {
    return new MatchesService(
      db as never,
      {} as never,
      {} as never,
      { sendPushToUsers: async () => 0 } as never,
      { record: async () => undefined } as never,
      { getNumber: async (_k: string, fb: number) => fb } as never,
      {} as never,
      { promoteNextInTx: async () => null } as never,
    );
  }

  it('returns [] for a past date WITHOUT touching the database', async () => {
    const { db, queries } = makeDb();
    const svc = makeService(db);

    const yesterday = riyadhDateKey(new Date(Date.now() - 86_400_000));
    const rows = await svc.getPitchSlots(PITCH_ID, yesterday);

    expect(rows).toEqual([]);
    expect(queries).toHaveLength(0); // short-circuit — no query ran
  });

  it('filters TODAY slots to strictly-future starts on the Riyadh clock', async () => {
    const { db, queries, params } = makeDb();
    const svc = makeService(db);

    await svc.getPitchSlots(PITCH_ID, riyadhDateKey());

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('"pitch_slots"."start_time" >');
    expect(queries[0]).toContain('::time');
    // The bound value is the LIVE Riyadh wall clock (minute precision).
    expect(params[2]).toBe(riyadhTimeNow());
  });

  it('lists a FUTURE date unfiltered (no time clause)', async () => {
    const { db, queries } = makeDb();
    const svc = makeService(db);

    const tomorrow = riyadhDateKey(new Date(Date.now() + 86_400_000));
    await svc.getPitchSlots(PITCH_ID, tomorrow);

    expect(queries).toHaveLength(1);
    expect(queries[0]).not.toContain('start_time');
  });
});
