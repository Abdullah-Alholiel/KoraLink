import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { PartnerService } from './partner.service';
import { pitch_slots, pitches, venue_verifications, venues } from '../../database/schema';

/**
 * P2-12 + run-85 Reviewer-A: partner writes re-check ownership inside the tx.
 *
 * createSlot / generateSlots / deleteSlot / submitVerification used to trust
 * an ownership pre-check and then write unscoped, so an ownership transfer
 * committing in between let the former owner write on a stale authorization.
 * Each write now runs in one tx behind an owner-scoped FOR UPDATE select.
 *
 * The stub renders every captured WHERE; when it carries an owner_id
 * predicate, a row is only "visible" if that predicate binds `currentOwner`
 * (the owner as committed when the tx runs) — same approach as the P2-120
 * deletePitch spec.
 */

process.env.TZ = 'UTC';

const dialect = new PgDialect();
const render = (where: unknown) => dialect.sqlToQuery(where as SQL);

const OWNER = 'owner-1';
const NEW_OWNER = 'owner-2';
const ADMIN = 'admin-1';
const PITCH = 'pitch-1';
const SLOT = 'slot-1';
const VENUE = 'venue-1';

const OPEN_HOURS = {
  open_hour: 8,
  close_hour: 23,
  closed_day_0: false,
  closed_day_1: false,
  closed_day_2: false,
  closed_day_3: false,
  closed_day_4: false,
  closed_day_5: false,
  closed_day_6: false,
};

interface StubOpts {
  /** Venue owner as committed in the DB when the tx runs. */
  currentOwner?: string;
  hours?: Record<string, unknown>;
  /** Slot as seen by the pre-check read and the in-tx lock. */
  slot?: { is_booked: boolean } | null;
  /** Slot as seen by the in-tx lock (defaults to `slot`). */
  lockedSlot?: { is_booked: boolean } | null;
  /** Rows the slot DELETE returns (defaults to a hit when the slot is visible). */
  deleteRows?: unknown[];
  /** Slot as seen by the re-read after a zero-row DELETE. */
  rereadSlot?: { is_booked: boolean } | null;
  /** Venue row the verification lock sees (null = gone). */
  venue?: { id: string; owner_id: string } | null;
  /** How many generated slot rows the upsert "creates" (rest conflict). */
  generatedCreated?: number;
}

function makeService(opts: StubOpts = {}) {
  const calls: string[] = [];
  const wheres: { lock?: unknown; delete?: unknown } = {};
  const inserted: Array<{ table: unknown; values: unknown }> = [];

  const visible = (where: unknown) => {
    const q = render(where);
    if (!q.sql.includes('owner_id') || opts.currentOwner === undefined) return true;
    return q.params.includes(opts.currentOwner);
  };

  function selectChain(table: unknown, inTx: boolean) {
    let where: unknown;
    let locked = false;
    const resolveRows = (): unknown[] => {
      if (table === pitches) {
        // Owner-scoped pitch lock vs. the (unscoped) venue-hours read.
        if (locked) return visible(where) ? [{ id: PITCH }] : [];
        return [opts.hours ?? OPEN_HOURS];
      }
      if (table === pitch_slots) {
        if (!inTx) return opts.slot ? [{ id: SLOT, pitch_id: PITCH, ...opts.slot }] : [];
        const row =
          locked ? (opts.lockedSlot !== undefined ? opts.lockedSlot : opts.slot) : opts.rereadSlot;
        return row && visible(where) ? [{ id: SLOT, ...row }] : [];
      }
      if (table === venues) {
        if (!inTx) return [];
        return opts.venue ? [opts.venue] : [];
      }
      throw new Error('unexpected table');
    };
    const chain = {
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: (w: unknown) => {
        where = w;
        return chain;
      },
      limit: () => chain,
      for: (mode: string) => {
        locked = true;
        wheres.lock = where;
        calls.push(`lock-${table === pitches ? 'pitch' : table === venues ? 'venue' : 'slot'}-${mode}`);
        return chain;
      },
      then: (resolve: (v: unknown) => void) => resolve(resolveRows()),
    };
    return chain;
  }

  const tx = {
    select: () => ({ from: (table: unknown) => selectChain(table, true) }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserted.push({ table, values });
        calls.push(table === pitch_slots ? 'insert-slot' : 'upsert-verification');
        const rows = Array.isArray(values) ? values : [values];
        const returned = rows.map((r, i) => ({ id: `s${i}`, ...(r as object) }));
        const created = opts.generatedCreated ?? returned.length;
        return {
          returning: async () => returned,
          onConflictDoNothing: () => ({ returning: async () => returned.slice(0, created) }),
          onConflictDoUpdate: async () => [],
        };
      },
    }),
    delete: () => ({
      where: (w: unknown) => {
        wheres.delete = w;
        calls.push('delete-slot');
        const hit = opts.slot && !opts.slot.is_booked && visible(w) ? [{ id: SLOT }] : [];
        return { returning: async () => opts.deleteRows ?? hit };
      },
    }),
  };

  const db = {
    transaction: async (fn: (t: typeof tx) => Promise<unknown>): Promise<unknown> => {
      calls.push('tx-begin');
      const out = await fn(tx);
      calls.push('tx-commit');
      return out;
    },
    select: () => ({ from: (table: unknown) => selectChain(table, false) }),
    insert: () => {
      throw new Error('writes must run inside the transaction');
    },
    delete: () => {
      throw new Error('writes must run inside the transaction');
    },
  };
  const broadcastOps = jest.fn();
  const svc = new PartnerService(db as never, { broadcastOps } as never);
  // assertPitchAccess is the (stale-able) pre-check — stub it as passing.
  (svc as unknown as { assertPitchAccess: () => Promise<void> }).assertPitchAccess =
    async () => {
      calls.push('assert-access');
    };
  return { svc, calls, wheres, inserted, broadcastOps };
}

const SLOT_DTO = { slot_date: '2026-10-05', start_time: '18:00', end_time: '19:00' };

describe('PartnerService.pitchOwnerScope (P2-12)', () => {
  const scopeOf = (svc: PartnerService, actorId: string, role: string) =>
    render(
      (
        svc as unknown as {
          pitchOwnerScope: (a: string, r: string, p: string) => SQL;
        }
      ).pitchOwnerScope(actorId, role, PITCH),
    );

  it('Admin: id-only equality, no owner predicate', () => {
    const q = scopeOf(makeService().svc, ADMIN, 'Admin');
    expect(q.sql).not.toContain('owner_id');
    expect(q.params).toEqual([PITCH]);
  });

  it('non-Admin: id equality AND venue-owner subquery bound to the actor', () => {
    const q = scopeOf(makeService().svc, OWNER, 'VenueOwner');
    expect(q.sql).toContain(' and ');
    expect(q.sql).toContain('IN (SELECT id FROM venues WHERE owner_id =');
    expect(q.sql).not.toContain('::uuid');
    expect(q.params).toEqual([PITCH, OWNER]);
  });
});

describe('PartnerService.createSlot owner scope in tx (P2-12/run-85)', () => {
  it('owner happy path: locks the pitch, inserts in the same tx, broadcasts after commit', async () => {
    const { svc, calls, wheres, broadcastOps } = makeService({ currentOwner: OWNER });
    const slot = await svc.createSlot(OWNER, 'VenueOwner', PITCH, SLOT_DTO as never);
    expect(slot).toMatchObject({ pitch_id: PITCH, slot_date: '2026-10-05', start_time: '18:00:00' });
    expect(calls).toEqual([
      'assert-access',
      'tx-begin',
      'lock-pitch-update',
      'insert-slot',
      'tx-commit',
    ]);
    expect(render(wheres.lock).params).toEqual([PITCH, OWNER]);
    expect(broadcastOps).toHaveBeenCalledWith('venues');
  });

  it('former owner after a transfer: scoped lock sees no row → 404, nothing inserted', async () => {
    const { svc, calls, broadcastOps } = makeService({ currentOwner: NEW_OWNER });
    await expect(svc.createSlot(OWNER, 'VenueOwner', PITCH, SLOT_DTO as never)).rejects.toThrow(
      new NotFoundException('Pitch not found.'),
    );
    expect(calls).not.toContain('insert-slot');
    expect(broadcastOps).not.toHaveBeenCalled();
  });

  it('Admin is unaffected by the owner scope', async () => {
    const { svc, calls, wheres } = makeService({ currentOwner: NEW_OWNER });
    await expect(
      svc.createSlot(ADMIN, 'Admin', PITCH, SLOT_DTO as never),
    ).resolves.toMatchObject({ pitch_id: PITCH });
    expect(render(wheres.lock).sql).not.toContain('owner_id');
    expect(calls).toContain('insert-slot');
  });

  it('keeps the closed-day validation inside the tx', async () => {
    // 2026-10-05 is a Monday (1).
    const { svc, calls } = makeService({
      currentOwner: OWNER,
      hours: { ...OPEN_HOURS, closed_day_1: true },
    });
    await expect(
      svc.createSlot(OWNER, 'VenueOwner', PITCH, SLOT_DTO as never),
    ).rejects.toThrow('The venue is closed on that day.');
    expect(calls).not.toContain('insert-slot');
  });
});

describe('PartnerService.generateSlots owner scope in tx (P2-12/run-85)', () => {
  // 2026-09-27 01:00 Riyadh (Sunday).
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-26T22:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  const PATTERN = {
    start_time: '18:00',
    end_time: '20:00',
    slot_duration_mins: 60,
    weeks_ahead: 1,
    days_of_week: [0, 1],
  };

  it('owner happy path: {created, skipped} counts conflicts and closed days', async () => {
    const { svc, calls, inserted } = makeService({
      currentOwner: OWNER,
      hours: { ...OPEN_HOURS, closed_day_0: true },
      generatedCreated: 1,
    });
    // Capacity 4 (2 days × 2 slots); Sunday closed → 2 rows; 1 conflicts.
    await expect(svc.generateSlots(OWNER, 'VenueOwner', PITCH, PATTERN)).resolves.toEqual({
      created: 1,
      skipped: 3,
    });
    expect(calls).toEqual([
      'assert-access',
      'tx-begin',
      'lock-pitch-update',
      'insert-slot',
      'tx-commit',
    ]);
    expect((inserted[0].values as Array<{ slot_date: string }>).map((r) => r.slot_date)).toEqual([
      '2026-09-28',
      '2026-09-28',
    ]);
  });

  it('former owner after a transfer: 404 before any slot is generated', async () => {
    const { svc, calls, broadcastOps } = makeService({ currentOwner: NEW_OWNER });
    await expect(svc.generateSlots(OWNER, 'VenueOwner', PITCH, PATTERN)).rejects.toThrow(
      new NotFoundException('Pitch not found.'),
    );
    expect(calls).not.toContain('insert-slot');
    expect(broadcastOps).not.toHaveBeenCalled();
  });

  it('Admin generates on any pitch', async () => {
    const { svc } = makeService({ currentOwner: NEW_OWNER });
    await expect(svc.generateSlots(ADMIN, 'Admin', PITCH, PATTERN)).resolves.toEqual({
      created: 4,
      skipped: 0,
    });
  });
});

describe('PartnerService.deleteSlot owner scope in tx (P2-12/run-85)', () => {
  const FREE = { is_booked: false };

  it('owner happy path: locked select + DELETE both carry the owner subquery', async () => {
    const { svc, calls, wheres, broadcastOps } = makeService({ currentOwner: OWNER, slot: FREE });
    await expect(svc.deleteSlot(OWNER, 'VenueOwner', SLOT)).resolves.toEqual({ deleted: true });
    expect(calls).toEqual([
      'assert-access',
      'tx-begin',
      'lock-slot-update',
      'delete-slot',
      'tx-commit',
    ]);
    for (const where of [wheres.lock, wheres.delete]) {
      const q = render(where);
      expect(q.sql).toContain(
        'IN (SELECT p.id FROM pitches p JOIN venues v ON v.id = p.venue_id WHERE v.owner_id =',
      );
      expect(q.params).toEqual(expect.arrayContaining([SLOT, OWNER]));
    }
    expect(broadcastOps).toHaveBeenCalledWith('venues');
  });

  it('former owner after a transfer: 404, nothing deleted', async () => {
    const { svc, calls, broadcastOps } = makeService({ currentOwner: NEW_OWNER, slot: FREE });
    await expect(svc.deleteSlot(OWNER, 'VenueOwner', SLOT)).rejects.toThrow(
      new NotFoundException('Slot not found.'),
    );
    expect(calls).not.toContain('delete-slot');
    expect(broadcastOps).not.toHaveBeenCalled();
  });

  it('slot booked before the lock: 409 preserved', async () => {
    const { svc, calls } = makeService({
      currentOwner: OWNER,
      slot: FREE,
      lockedSlot: { is_booked: true },
    });
    await expect(svc.deleteSlot(OWNER, 'VenueOwner', SLOT)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(calls).not.toContain('delete-slot');
  });

  it('zero-row DELETE with the slot still visible and booked → 409', async () => {
    const { svc } = makeService({
      currentOwner: OWNER,
      slot: FREE,
      deleteRows: [],
      rereadSlot: { is_booked: true },
    });
    await expect(svc.deleteSlot(OWNER, 'VenueOwner', SLOT)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('zero-row DELETE with the slot out of scope → 404 (not the booked 409)', async () => {
    const { svc, broadcastOps } = makeService({
      currentOwner: OWNER,
      slot: FREE,
      deleteRows: [],
      rereadSlot: null,
    });
    await expect(svc.deleteSlot(OWNER, 'VenueOwner', SLOT)).rejects.toThrow(
      new NotFoundException('Slot not found.'),
    );
    expect(broadcastOps).not.toHaveBeenCalled();
  });

  it('Admin: id-only scope, deletes regardless of owner', async () => {
    const { svc, wheres } = makeService({ currentOwner: NEW_OWNER, slot: FREE });
    await expect(svc.deleteSlot(ADMIN, 'Admin', SLOT)).resolves.toEqual({ deleted: true });
    expect(render(wheres.delete).sql).not.toContain('owner_id');
  });
});

describe('PartnerService.submitVerification ownership in tx (P2-12/run-85)', () => {
  const DTO = { venue_id: VENUE, legal_entity_name: 'Kora LLC', iban: 'SA0000000000000000000000' };

  it('owner happy path: locks the venue and upserts in the same tx', async () => {
    const { svc, calls, inserted } = makeService({ venue: { id: VENUE, owner_id: OWNER } });
    await expect(svc.submitVerification(OWNER, DTO as never)).resolves.toEqual([]);
    expect(calls).toEqual(['tx-begin', 'lock-venue-update', 'upsert-verification', 'tx-commit']);
    expect(inserted[0].table).toBe(venue_verifications);
    expect(inserted[0].values).toMatchObject({ venue_id: VENUE, status: 'pending' });
  });

  it('non-owner: 403 with the existing message, no upsert', async () => {
    const { svc, calls } = makeService({ venue: { id: VENUE, owner_id: OWNER } });
    await expect(svc.submitVerification('stranger', DTO as never)).rejects.toThrow(
      new ForbiddenException('You can only verify your own venues.'),
    );
    expect(calls).not.toContain('upsert-verification');
  });

  it('ownership transferred before the tx lock: former owner is refused, no upsert', async () => {
    const { svc, calls } = makeService({ venue: { id: VENUE, owner_id: NEW_OWNER } });
    await expect(svc.submitVerification(OWNER, DTO as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(calls).not.toContain('upsert-verification');
  });

  it('venue gone: 404, no upsert', async () => {
    const { svc, calls } = makeService({ venue: null });
    await expect(svc.submitVerification(OWNER, DTO as never)).rejects.toThrow(
      new NotFoundException('Venue not found.'),
    );
    expect(calls).not.toContain('upsert-verification');
  });
});
