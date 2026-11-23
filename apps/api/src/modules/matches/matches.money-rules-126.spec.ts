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
  /** users row for the karma read in markNoShow; undefined = empty select. */
  userRow?: { karma_score: number };
  /** matches UPDATE payloads carrying pitch_forfeited_sar (the forfeit stamp). */
  forfeitStamps: Array<Record<string, unknown>>;
  /** match_players UPDATE payloads (flag writes + karma-applied stamps). */
  playerSets: Array<Record<string, unknown>>;
  payers: Array<{ id: string; user_id: string; fee_paid_sar: string | null }>;
  slot: { id: string; is_booked: boolean } | null;
  player: ({ id: string; no_show: boolean; fee_paid_sar: string | null; no_show_karma_applied?: number | null } & Record<string, unknown>) | null;
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
    select: (cols?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        // column-aware mapping: a select shaped {applied: ...} reads the
        // roster row's no_show_karma_applied (matches markNoShow's applied read)
        const mapPlayer = (
          r: { id: string; no_show: boolean; fee_paid_sar: string | null; no_show_karma_applied?: number | null },
        ) => (cols && 'applied' in cols ? { applied: r.no_show_karma_applied } : r);
        if (table === matches) return chain(() => [w.matchRow]);
        if (table === users) return chain(() => (w.userRow ? [w.userRow] : []));
        if (table === match_waitlist) return chain(() => []);
        if (table === disputes) return chain(() => []);
        if (table === pitch_slots) return chain(() => (w.slot ? [w.slot] : []));
        if (table === match_players) {
          // markNoShow selects one roster row; cancelMatch selects payers.
          return chain(() => (w.player ? [mapPlayer(w.player)] : w.payers));
        }
        if (table === transactions) {
          const c = chain(() => []);
          c.then = (res: (v: unknown) => void) => {
            const p = params((c as { _where: () => unknown })._where());
            // emulate eq(key)/eq(user) AND LIKE '<prefix>%' clauses: if a
            // param looks like a key prefix, treat the query as the fee-family
            // fetch (markNoShow reads it for instance pairing). The LIKE
            // pattern carries a trailing '%' — strip it for startsWith.
            const likePattern = p.find(
              (v) => typeof v === 'string' && v.startsWith('noshow-fee:'),
            );
            const prefix =
              typeof likePattern === 'string' ? likePattern.replace(/%$/, '') : undefined;
            res(
              prefix !== undefined
                ? w.ledger
                    .filter(
                      (l) =>
                        l.user_id === p[0] &&
                        l.idempotency_key.startsWith(prefix),
                    )
                    .map((l) => ({ key: l.idempotency_key, amount: l.amount }))
                : w.ledger
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
          if (table === matches && s.pitch_forfeited_sar !== undefined) w.forfeitStamps.push(s);
          if (table === match_players) w.playerSets.push(s);
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
    forfeitStamps: [],
    playerSets: [],
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

  it('(c2) Open match at/after kick-off → FORFEIT (the wait-it-out dodge is closed)', async () => {
    // Open match that never started, cancelled 30 min AFTER its scheduled
    // start: isLateHostCancel is true past kick-off → forfeit, stamp written.
    const w = cancelWorld(-30 * 60 * 1000, 'Open');
    const { svc } = makeService(w);
    await svc.cancelMatch(HOST, MATCH_ID);

    expect(w.ledger.filter((l) => l.user_id === HOST)).toHaveLength(0);
    expect(w.slotReleased).toBe(true);
    expect(w.forfeitStamps).toEqual([
      expect.objectContaining({ pitch_forfeited_sar: '300.00' }),
    ]);
  });

  it('(c3) forfeit stamps the match row → settlement counts it; refund path writes NO stamp', async () => {
    const late = cancelWorld(2 * HOUR);
    const { svc: lateSvc } = makeService(late);
    await lateSvc.cancelMatch(HOST, MATCH_ID);
    expect(late.forfeitStamps).toEqual([
      expect.objectContaining({ pitch_forfeited_sar: '300.00' }),
    ]);

    const early = cancelWorld(13 * HOUR);
    const { svc: earlySvc } = makeService(early);
    await earlySvc.cancelMatch(HOST, MATCH_ID);
    expect(early.forfeitStamps).toHaveLength(0);
  });

  it('isLateHostCancel: boundary + fail-toward-refund semantics', () => {
    const now = Date.UTC(2026, 10, 23, 12);
    expect(isLateHostCancel(new Date(now + 12 * HOUR), now)).toBe(false); // exactly 12h → refund
    expect(isLateHostCancel(new Date(now + 12 * HOUR - 1), now)).toBe(true);
    expect(isLateHostCancel(new Date(now), now)).toBe(true); // at start → late (not ≥12h before)
    expect(isLateHostCancel(new Date(now - 30 * 60_000), now)).toBe(true); // past start → late
    expect(isLateHostCancel(new Date(now + HOUR).toISOString(), now)).toBe(true);
    expect(isLateHostCancel(null, now)).toBe(false);
    expect(isLateHostCancel('garbage', now)).toBe(false);
  });
});

// ─────────────────────────────── Rule B ───────────────────────────────

const TARGET = 'player-1';
const MP_ID = 'mp-9';

function noShowWorld(fee: string | null, flagged = false, karma = 10): World {
  return {
    ledger: [],
    matchRow: {
      id: MATCH_ID,
      host_id: HOST,
      status: 'Completed',
      scheduled_at: new Date('2020-01-01T18:00:00Z'),
      price_per_player: '35.00',
    },
    userRow: { karma_score: karma },
    payers: [],
    slot: null,
    player: { id: MP_ID, no_show: flagged, fee_paid_sar: fee },
    slotReleased: false,
    userSets: [],
    forfeitStamps: [],
    playerSets: [],
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
        idempotency_key: `noshow-fee:${MP_ID}:1`,
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
    (w.player as { no_show_karma_applied?: number }).no_show_karma_applied = 5; // the mark's stamp committed
    await svc.markNoShow(HOST, MATCH_ID, TARGET, false);

    const reversal = w.ledger.find((l) => l.idempotency_key === `noshow-fee:${MP_ID}:r1`);
    expect(reversal).toMatchObject({
      user_id: TARGET,
      type: 'CREDIT',
      amount: '35.00',
      reference_type: 'REFUND',
      reference_id: MATCH_ID,
    });
    const k = karmaSet(w, 1);
    expect(k.sql).toMatch(/LEAST\(\s*.*karma_score.* \+ \$1, 100\)/);
    expect(k.params).toEqual([5]);
  });

  it('(d2) fee basis = the player’s OWN paid snapshot, not the current match price (PR-Agent r1)', async () => {
    // seat paid 30.00 at join; match price later drifted to 35.00 → the
    // no-show fee must be 30.00 (what the player actually paid)
    const w = noShowWorld('30.00');
    (w.matchRow as { price_per_player: string }).price_per_player = '35.00';
    const { svc } = makeService(w);
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);

    expect(w.ledger).toEqual([
      expect.objectContaining({
        type: 'DEBIT',
        amount: '30.00',
        reference_type: 'MATCH_FEE',
        idempotency_key: `noshow-fee:${MP_ID}:1`,
      }),
    ]);
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

  it('(k1) mark a player with karma 3 → only 3 applied (floor-clamped, stamped per episode)', async () => {
    const w = noShowWorld(null, false, 3);
    const { svc } = makeService(w);
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);

    // the episode stamps EXACTLY what was taken
    expect(w.playerSets).toEqual(
      expect.arrayContaining([expect.objectContaining({ no_show_karma_applied: 3 })]),
    );
    const k = karmaSet(w, 0);
    expect(k.sql).toMatch(/GREATEST/);
    expect(k.params).toEqual([3]);
  });

  it('(k2) un-mark reverses the STORED applied amount — karma 0 mark→unmark nets exactly zero', async () => {
    // mark at the 0 floor: nothing applied, stamped 0
    const w = noShowWorld(null, false, 0);
    const { svc } = makeService(w);
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);
    expect(w.playerSets).toEqual(
      expect.arrayContaining([expect.objectContaining({ no_show_karma_applied: 0 })]),
    );
    expect(karmaSet(w, 0).params).toEqual([0]);

    // un-mark: restores 0, not the constant 5 — no phantom gain
    w.player!.no_show = true;
    (w.player as { no_show_karma_applied?: number }).no_show_karma_applied = 0;
    await svc.markNoShow(HOST, MATCH_ID, TARGET, false);
    expect(karmaSet(w, 1).params).toEqual([0]);
  });

  it('(g) toggle on → off → on → TWO fee debits, ONE reversal (re-mark charges a fresh instance)', async () => {
    const w = noShowWorld('35.00');
    const { svc } = makeService(w);
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);
    w.player!.no_show = true;
    await svc.markNoShow(HOST, MATCH_ID, TARGET, false);
    w.player!.no_show = false;
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);

    // instance 1 charged + reversed; instance 2 charged (standing)
    const debits = w.ledger.filter((l) => l.type === 'DEBIT');
    expect(debits.map((l) => l.idempotency_key).sort()).toEqual([
      `noshow-fee:${MP_ID}:1`,
      `noshow-fee:${MP_ID}:2`,
    ]);
    expect(
      w.ledger.filter((l) => l.idempotency_key === `noshow-fee:${MP_ID}:r1`),
    ).toHaveLength(1);
    // sequential retry of the re-mark (flag already committed true) replays:
    // no flip → no new charge
    w.player!.no_show = true;
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);
    expect(w.ledger.filter((l) => l.type === 'DEBIT')).toHaveLength(2);
  });

  it('(g2) full cycle on → off → on → off → exactly 2 fees + 2 reversals', async () => {
    const w = noShowWorld('35.00');
    const { svc } = makeService(w);
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);
    w.player!.no_show = true;
    await svc.markNoShow(HOST, MATCH_ID, TARGET, false);
    w.player!.no_show = false;
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);
    w.player!.no_show = true;
    await svc.markNoShow(HOST, MATCH_ID, TARGET, false);

    const debits = w.ledger.filter((l) => l.type === 'DEBIT');
    const credits = w.ledger.filter(
      (l) => l.type === 'CREDIT' && l.idempotency_key.startsWith(`noshow-fee:${MP_ID}:r`),
    );
    expect(debits.map((l) => l.idempotency_key).sort()).toEqual([
      `noshow-fee:${MP_ID}:1`,
      `noshow-fee:${MP_ID}:2`,
    ]);
    expect(credits.map((l) => l.idempotency_key).sort()).toEqual([
      `noshow-fee:${MP_ID}:r1`,
      `noshow-fee:${MP_ID}:r2`,
    ]);
    // net money movement across the whole cycle = zero
    const net =
      debits.reduce((s, l) => s + parseFloat(l.amount), 0) -
      credits.reduce((s, l) => s + parseFloat(l.amount), 0);
    expect(net).toBe(0);
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
