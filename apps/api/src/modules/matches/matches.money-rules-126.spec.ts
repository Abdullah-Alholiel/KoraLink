import { BadRequestException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { MatchesService, isLateHostCancel } from './matches.service';
import {
  disputes,
  match_players,
  match_waitlist,
  matches,
  pitch_slots,
  transactions,
  users,
} from '../../database/schema';

/**
 * Run #225 — owner money rules (launch condition 6):
 *  A. D-20261115-04 — host cancels a paid koralink booking < 12h before a
 *     not-yet-started kick-off ⇒ pitch cost forfeit to the venue (no host
 *     credit). Joiners are always refunded 100%; the slot is always released.
 *  B. D-20261113-10 — host marks a PAID player no-show ⇒ MATCH_FEE debit of
 *     price_per_player (key noshow-fee-<mpId>) + karma −5; un-mark reverses
 *     both (REFUND credit key noshow-fee-reversal-<mpId>, karma +5).
 *
 * The tx fake is a small in-memory ledger: transactions rows are stored and
 * looked up by the idempotency key bound into the WHERE clause (rendered via
 * PgDialect), so the replay pre-checks in chargeMatchFeeTx / creditWalletTx
 * run for real against it.
 */

const dialect = new PgDialect();
const params = (w: unknown): unknown[] =>
  w ? dialect.sqlToQuery(w as SQL).params : [];
const render = (s: unknown): { sql: string; params: unknown[] } =>
  dialect.sqlToQuery(s as SQL);

type Ledger = {
  user_id: string;
  type: string;
  amount: string;
  reference_type: string;
  reference_id: string | null;
  idempotency_key: string;
};

interface World {
  ledger: Ledger[];
  matchRow: Record<string, unknown>;
  payers: Array<{ id: string; user_id: string; fee_paid_sar: string | null }>;
  slot: { id: string; is_booked: boolean } | null;
  player: { id: string; no_show: boolean; fee_paid_sar: string | null } | null;
  slotReleased: boolean;
  userSets: Array<Record<string, unknown>>;
  /** wallet_balance returned by the guarded users UPDATE (negative ⇒ 400). */
  balanceAfter: string;
}

function makeTx(w: World) {
  function chain(rows: () => unknown[]) {
    const c: Record<string, unknown> = {};
    let whereArg: unknown;
    c.where = (arg: unknown) => {
      whereArg = arg;
      return c;
    };
    c.limit = () => c;
    c.for = () => c;
    c.then = (res: (v: unknown) => void) => res(rows());
    // expose the WHERE arg for ledger lookups
    (c as { _where: () => unknown })._where = () => whereArg;
    return c;
  }
  return {
    execute: async () => [w.matchRow],
    select: () => ({
      from: (table: unknown) => {
        if (table === matches) return chain(() => [w.matchRow]);
        if (table === match_waitlist) return chain(() => []);
        if (table === disputes) return chain(() => []);
        if (table === pitch_slots) return chain(() => (w.slot ? [w.slot] : []));
        if (table === match_players) {
          // markNoShow selects one roster row; cancelMatch selects payers.
          return chain(() => (w.player ? [w.player] : w.payers));
        }
        if (table === transactions) {
          const c = chain(() => []);
          c.then = (res: (v: unknown) => void) => {
            const p = params((c as { _where: () => unknown })._where());
            res(
              w.ledger
                .filter((l) => p.includes(l.idempotency_key) && p.includes(l.user_id))
                .map((l) => ({ id: `tx-${l.idempotency_key}`, amount: l.amount })),
            );
          };
          return c;
        }
        return chain(() => []);
      },
    }),
    insert: (table: unknown) => ({
      values: (v: Ledger & Record<string, unknown>) => {
        if (table === transactions) {
          if (w.ledger.some((l) => l.idempotency_key === v.idempotency_key)) {
            throw Object.assign(new Error('dup'), { code: '23505' });
          }
          w.ledger.push({ ...v });
        }
        const out = {
          then: (res: (v: unknown) => void) => res([]),
          returning: () => ({
            then: (res: (v: unknown) => void) => res([{ id: `tx-${v.idempotency_key}` }]),
          }),
        };
        return out;
      },
    }),
    update: (table: unknown) => ({
      set: (s: Record<string, unknown>) => ({
        where: () => {
          if (table === users) w.userSets.push(s);
          if (table === pitch_slots && s.is_booked === false) w.slotReleased = true;
          return {
            then: (res: (v: unknown) => void) => res([]),
            returning: () => ({
              then: (res: (v: unknown) => void) =>
                res(
                  table === users
                    ? [{ wallet_balance: w.balanceAfter }]
                    : [{ id: w.matchRow.id }],
                ),
            }),
          };
        },
      }),
    }),
  };
}

function makeService(w: World) {
  const pushes: Array<{ to: string[]; key: string; vars: Record<string, unknown> }> = [];
  const db = {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(makeTx(w)),
  };
  const svc = new MatchesService(
    db as never,
    {} as never, // walletService
    { broadcastStatusUpdate: () => {}, broadcastRosterUpdate: () => {} } as never,
    {
      sendPushToUsers: async (to: string[], p: { key: string; vars: Record<string, unknown> }) => {
        pushes.push({ to, key: p.key, vars: p.vars });
      },
    } as never,
    { record: async () => {} } as never,
    { getNumber: async () => 0 } as never,
    { broadcastOps: () => {} } as never,
    { promoteNextInTx: async () => null } as never,
  );
  jest
    .spyOn(svc, 'findOne')
    .mockResolvedValue({ id: w.matchRow.id, title: 'Friday 7s' } as never);
  return { svc, pushes };
}

const HOST = 'host-1';
const MATCH_ID = 'match-1';
const HOUR = 60 * 60 * 1000;

// ─────────────────────────────── Rule A ───────────────────────────────

function cancelWorld(startsInMs: number, status = 'Open'): World {
  return {
    ledger: [],
    matchRow: {
      id: MATCH_ID,
      host_id: HOST,
      status,
      booking_mode: 'koralink',
      booking_slot_id: 'slot-1',
      pitch_cost_sar: '300.00',
      price_per_player: '30.00',
      max_players: 10,
      is_player_hosted: false,
      host_payout_state: 'none',
      scheduled_at: new Date(Date.now() + startsInMs),
    },
    payers: [
      { id: 'mp-a', user_id: 'joiner-a', fee_paid_sar: '30.00' },
      { id: 'mp-b', user_id: 'joiner-b', fee_paid_sar: '30.00' },
    ],
    slot: { id: 'slot-1', is_booked: true },
    player: null,
    slotReleased: false,
    userSets: [],
    balanceAfter: '100.00',
  };
}

describe('Rule A (D-20261115-04) — cancelMatch late-cancel forfeit', () => {
  it('(a) cancel ≥12h before start → host credited the full pitch cost under refund-<matchId>', async () => {
    const w = cancelWorld(13 * HOUR);
    const { svc, pushes } = makeService(w);
    await svc.cancelMatch(HOST, MATCH_ID);

    const host = w.ledger.filter((l) => l.user_id === HOST);
    expect(host).toHaveLength(1);
    expect(host[0]).toMatchObject({
      type: 'CREDIT',
      amount: '300.00',
      reference_type: 'REFUND',
      idempotency_key: `refund-${MATCH_ID}`,
    });
    expect(w.slotReleased).toBe(true);
    expect(pushes.find((p) => p.to[0] === HOST)?.key).toBe('refund_credited');
    expect(pushes.some((p) => p.key === 'pitch_forfeit')).toBe(false);
  });

  it('(b) cancel <12h before start → NO host credit, slot released, joiners refunded 100%', async () => {
    const w = cancelWorld(2 * HOUR);
    const { svc, pushes } = makeService(w);
    await svc.cancelMatch(HOST, MATCH_ID);

    expect(w.ledger.filter((l) => l.user_id === HOST)).toHaveLength(0);
    expect(w.slotReleased).toBe(true);

    const joiners = w.ledger.filter((l) => l.user_id !== HOST);
    expect(joiners).toHaveLength(2);
    expect(joiners.map((l) => l.idempotency_key).sort()).toEqual([
      'refund-join-mp-a',
      'refund-join-mp-b',
    ]);
    joiners.forEach((l) => {
      expect(l).toMatchObject({ type: 'CREDIT', amount: '30.00', reference_type: 'REFUND' });
    });

    const hostPushes = pushes.filter((p) => p.to[0] === HOST);
    expect(hostPushes).toHaveLength(1);
    expect(hostPushes[0]).toMatchObject({
      key: 'pitch_forfeit',
      vars: { title: 'Friday 7s', amount: '300.00' },
    });
  });

  it('(c) cancel after start (emergency) → host still credited (existing behavior)', async () => {
    const w = cancelWorld(-30 * 60 * 1000, 'InProgress');
    const { svc } = makeService(w);
    await svc.cancelMatch(HOST, MATCH_ID);

    const host = w.ledger.filter((l) => l.user_id === HOST);
    expect(host).toHaveLength(1);
    expect(host[0]).toMatchObject({ amount: '300.00', idempotency_key: `refund-${MATCH_ID}` });
  });

  it('isLateHostCancel: boundary + fail-toward-refund semantics', () => {
    const now = Date.UTC(2026, 10, 23, 12);
    expect(isLateHostCancel(new Date(now + 12 * HOUR), now)).toBe(false); // exactly 12h → refund
    expect(isLateHostCancel(new Date(now + 12 * HOUR - 1), now)).toBe(true);
    expect(isLateHostCancel(new Date(now), now)).toBe(false); // started
    expect(isLateHostCancel(new Date(now + HOUR).toISOString(), now)).toBe(true);
    expect(isLateHostCancel(null, now)).toBe(false);
    expect(isLateHostCancel('garbage', now)).toBe(false);
  });
});

// ─────────────────────────────── Rule B ───────────────────────────────

const TARGET = 'player-1';
const MP_ID = 'mp-9';

function noShowWorld(fee: string | null, flagged = false): World {
  return {
    ledger: [],
    matchRow: {
      id: MATCH_ID,
      host_id: HOST,
      status: 'Completed',
      scheduled_at: new Date('2020-01-01T18:00:00Z'),
      price_per_player: '35.00',
    },
    payers: [],
    slot: null,
    player: { id: MP_ID, no_show: flagged, fee_paid_sar: fee },
    slotReleased: false,
    userSets: [],
    balanceAfter: '65.00',
  };
}

/** The n-th users UPDATE that touched karma_score (wallet writes skipped). */
function karmaSet(w: World, n: number) {
  const sets = w.userSets.filter((s) => s.karma_score !== undefined);
  return render(sets[n].karma_score);
}

describe('Rule B (D-20261113-10) — markNoShow fee + karma', () => {
  it('(d) mark a paid player → MATCH_FEE debit of exactly price_per_player + karma −5', async () => {
    const w = noShowWorld('35.00');
    const { svc } = makeService(w);
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);

    expect(w.ledger).toEqual([
      expect.objectContaining({
        user_id: TARGET,
        type: 'DEBIT',
        amount: '35.00',
        reference_type: 'MATCH_FEE',
        reference_id: MATCH_ID,
        idempotency_key: `noshow-fee-${MP_ID}`,
      }),
    ]);
    const k = karmaSet(w, 0);
    expect(k.sql).toMatch(/GREATEST\(.*karma_score.* - \$1, 0\)/);
    expect(k.params).toEqual([5]);
  });

  it('(e) un-mark after a fee → REFUND credit under noshow-fee-reversal-<mpId> + karma +5', async () => {
    const w = noShowWorld('35.00');
    const { svc } = makeService(w);
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);
    w.player!.no_show = true; // the flag write committed
    await svc.markNoShow(HOST, MATCH_ID, TARGET, false);

    const reversal = w.ledger.find((l) => l.idempotency_key === `noshow-fee-reversal-${MP_ID}`);
    expect(reversal).toMatchObject({
      user_id: TARGET,
      type: 'CREDIT',
      amount: '35.00',
      reference_type: 'REFUND',
      reference_id: MATCH_ID,
    });
    const k = karmaSet(w, 1);
    expect(k.sql).toMatch(/LEAST\(.*karma_score.* \+ \$1, 100\)/);
    expect(k.params).toEqual([5]);
  });

  it('(f) no-show on an unpaid player (fee_paid_sar null) → no debit (karma still applies)', async () => {
    const w = noShowWorld(null);
    const { svc } = makeService(w);
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);
    expect(w.ledger).toHaveLength(0);
    expect(w.userSets).toHaveLength(1);
    expect(karmaSet(w, 0).sql).toContain('GREATEST');
  });

  it('(f2) un-mark with no prior fee → no reversal credit', async () => {
    const w = noShowWorld(null, true);
    const { svc } = makeService(w);
    await svc.markNoShow(HOST, MATCH_ID, TARGET, false);
    expect(w.ledger).toHaveLength(0);
  });

  it('(g) toggle on → off → on → exactly ONE fee debit (per-episode replay guard)', async () => {
    const w = noShowWorld('35.00');
    const { svc } = makeService(w);
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);
    w.player!.no_show = true;
    await svc.markNoShow(HOST, MATCH_ID, TARGET, false);
    w.player!.no_show = false;
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);

    const fees = w.ledger.filter((l) => l.idempotency_key === `noshow-fee-${MP_ID}`);
    expect(fees).toHaveLength(1);
    expect(w.ledger.filter((l) => l.type === 'DEBIT')).toHaveLength(1);
  });

  it('repeated mark (already flagged) → no second debit', async () => {
    const w = noShowWorld('35.00');
    const { svc } = makeService(w);
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);
    w.player!.no_show = true;
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);
    expect(w.ledger).toHaveLength(1);
  });

  it('unaffordable fee → BadRequest (whole mark rolls back in the caller tx)', async () => {
    const w = noShowWorld('35.00');
    w.balanceAfter = '-5.00';
    const { svc } = makeService(w);
    await expect(svc.markNoShow(HOST, MATCH_ID, TARGET, true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
