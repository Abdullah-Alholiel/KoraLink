import { PartnerService, riyadhDateString, riyadhTrendDays } from './partner.service';

/**
 * P2-109 regression specs: dashboard trend axis + generateSlots weekdays are
 * Riyadh-local (fixed UTC+03:00), never server-local / server-UTC.
 *
 * 2026-09-26T22:00:00Z = 2026-09-27 01:00 Riyadh (Sunday), while a UTC server
 * still thinks it is Saturday 2026-09-26.
 */
process.env.TZ = 'UTC';
const NOW = new Date('2026-09-26T22:00:00Z');

type SlotRow = { pitch_id: string; slot_date: string; start_time: string; end_time: string };

function makeService(venueRow: unknown | undefined) {
  const inserted: SlotRow[] = [];
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: async () => (venueRow ? [venueRow] : []) }),
        }),
      }),
    }),
    insert: () => ({
      values: (rows: SlotRow[]) => {
        inserted.push(...rows);
        return {
          onConflictDoNothing: () => ({
            returning: async () => rows.map((_, i) => ({ id: `s${i}` })),
          }),
        };
      },
    }),
  };
  const svc = new PartnerService(db as never, { broadcastOps: () => {} } as never);
  (svc as unknown as { assertPitchAccess: () => Promise<void> }).assertPitchAccess =
    async () => {};
  return { svc, inserted };
}

const PATTERN = {
  start_time: '18:00',
  end_time: '19:00',
  slot_duration_mins: 60,
  weeks_ahead: 2,
};

describe('Riyadh calendar helpers (P2-109)', () => {
  it('riyadhDateString rolls over at 21:00 UTC', () => {
    expect(riyadhDateString(new Date('2026-09-26T20:59:59Z').getTime())).toBe('2026-09-26');
    expect(riyadhDateString(NOW.getTime())).toBe('2026-09-27');
  });

  it('weeklyTrend axis = 7 consecutive Riyadh days ending Riyadh-today, oldest first', () => {
    expect(riyadhTrendDays(NOW.getTime())).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
  });

  it('axis crosses month boundaries', () => {
    expect(riyadhTrendDays(new Date('2026-10-02T21:30:00Z').getTime())).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });
});

describe('PartnerService.generateSlots Riyadh weekdays (P2-109)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  it('Sunday (0) lands on Riyadh-today Sunday 2026-09-27', async () => {
    const { svc, inserted } = makeService(undefined);
    await svc.generateSlots('a', 'VenueOwner', 'p1', { ...PATTERN, days_of_week: [0] });
    expect(inserted.map((r) => r.slot_date)).toEqual(['2026-09-27', '2026-10-04']);
  });

  it('Saturday (6) is next Riyadh Saturday, not the server-local (already past) Saturday', async () => {
    const { svc, inserted } = makeService(undefined);
    await svc.generateSlots('a', 'VenueOwner', 'p1', { ...PATTERN, days_of_week: [6] });
    expect(inserted.map((r) => r.slot_date)).toEqual(['2026-10-03', '2026-10-10']);
    for (const r of inserted) {
      expect(new Date(`${r.slot_date}T00:00:00Z`).getUTCDay()).toBe(6);
    }
  });

  it('falls back to full-day hours when the venue row is missing', async () => {
    const { svc, inserted } = makeService(undefined);
    const res = await svc.generateSlots('a', 'VenueOwner', 'p1', {
      ...PATTERN,
      weeks_ahead: 1,
      days_of_week: [1],
    });
    expect(inserted).toEqual([
      { pitch_id: 'p1', slot_date: '2026-09-28', start_time: '18:00:00', end_time: '19:00:00' },
    ]);
    expect(res).toEqual({ created: 1, skipped: 0 });
  });

  it('closed-day venues skip that Riyadh weekday', async () => {
    const { svc, inserted } = makeService({ open_hour: 8, close_hour: 23, closed_day_0: true });
    await svc.generateSlots('a', 'VenueOwner', 'p1', { ...PATTERN, days_of_week: [0, 1] });
    expect(inserted.map((r) => r.slot_date)).toEqual(['2026-09-28', '2026-10-05']);
  });
});
