/**
 * P2-193 (run #155): refund/payout events get a PUSH. Before this slice a
 * cancel/auto-cancel/leave/host-removal refunded wallet money silently — the
 * player only discovered the credit by opening wallet history (Reviewer B P0,
 * run #129; Reviewer B CRITICAL, run #155).
 *
 * These specs pin the WIRING on the two paths with the richest refund
 * fan-out: cancelMatch (per-payer pushes + host pitch-refund push) and
 * removePlayer (removed player's fee-refund push). The harness routes the tx
 * stub by table identity (same pattern as matches.remove-player.spec.ts).
 * Money math itself is NOT re-tested here — matches.money-exact.spec.ts owns
 * the amounts; these specs own "who gets told, with which key, quoting what".
 */
import { MatchesService } from './matches.service';
import { matches, match_players, users, transactions, pitch_slots } from '../../database/schema';

const HOST = 'host-1';
const PAYER_A = 'payer-a';
const PAYER_B = 'payer-b';
const MATCH_ID = 'match-1';

function thenable(): { then: (r: (v: unknown) => void) => void } {
  return { then: (r: (v: unknown) => void) => r([]) };
}

interface PushRec {
  users: string[];
  key?: string;
  vars?: { title?: string; amount?: string };
  data?: { type?: string; matchId?: string };
}

function makeHarness(opts: {
  match?: Record<string, unknown> | null;
  payers?: Array<{ id: string; user_id: string; fee_paid_sar: string | null }>;
  player?: Record<string, unknown> | null;
}) {
  const pushes: PushRec[] = [];
  const notificationsService = {
    sendPushToUsers: async (usersArg: string[], p: PushRec) => {
      pushes.push({ users: usersArg, key: p.key, vars: p.vars, data: p.data });
    },
  };
  const activitiesService = { record: async () => undefined };

  function chainFor(rows: unknown[]) {
    const chain: any = {
      where: () => chain,
      limit: () => chain,
      for: function (this: any) {
        return this;
      },
    };
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  }

  const tx = {
    select: () => ({
      from: (table: unknown) => {
        if (table === matches) return chainFor(opts.match ? [opts.match] : []);
        if (table === match_players) return chainFor(opts.payers ?? (opts.player ? [opts.player] : []));
        if (table === pitch_slots) return chainFor([{ id: 'slot-1', is_booked: true }]);
        if (table === users) return chainFor([{ id: HOST, wallet_balance: '0' }]);
        if (table === transactions) return chainFor([]);
        return chainFor([]);
      },
    }),
    update: () => ({
      set: () => {
        const c: any = { where: () => c, returning: () => [{ id: MATCH_ID }] };
        return c;
      },
    }),
    delete: () => ({ where: () => thenable() }),
    insert: () => ({ values: () => thenable() }),
    execute: () => chainFor(opts.match ? [opts.match] : []),
  };

  const db = {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(tx),
    query: {
      matches: {
        findFirst: async () => ({
          id: MATCH_ID,
          status: 'Cancelled',
          title: 'Friday 7s',
          scheduled_at: new Date('2030-01-01T18:00:00Z'),
          duration_mins: 90,
          completed_at: null,
          players: [],
          messages: [],
        }),
      },
    },
  };

  const svc = new MatchesService(
    db as never,
    {} as never, // walletService
    { broadcastRosterUpdate: () => {}, broadcastStatusUpdate: () => {} } as never,
    notificationsService as never,
    activitiesService as never,
    { getNumber: async () => 0 } as never,
    { broadcastOps: () => {} } as never,
    { promoteNextInTx: async () => null } as never,
  );
  return { svc, pushes };
}

describe('P2-193 — cancelMatch refund pushes', () => {
  const baseMatch = {
    id: MATCH_ID,
    host_id: HOST,
    status: 'Open',
    booking_mode: 'koralink',
    booking_slot_id: 'slot-1',
    pitch_cost_sar: '120.00',
    price_per_player: '37.00',
    max_players: 10,
    is_player_hosted: false,
    host_payout_state: 'n/a',
  };

  it('every refunded payer gets refund_credited quoting their exact fee', async () => {
    const { svc, pushes } = makeHarness({
      match: baseMatch,
      payers: [
        { id: 'mp-a', user_id: PAYER_A, fee_paid_sar: '37.00' },
        { id: 'mp-b', user_id: PAYER_B, fee_paid_sar: '41.50' },
      ],
    });

    await svc.cancelMatch(HOST, MATCH_ID);

    const refundPushes = pushes.filter((p) => p.key === 'refund_credited');
    // 2 joiner refunds + 1 host pitch refund (koralink booking).
    expect(refundPushes).toHaveLength(3);
    expect(refundPushes.map((p) => p.users[0]).sort()).toEqual([HOST, PAYER_A, PAYER_B].sort());
    const payerAPush = refundPushes.find((p) => p.users[0] === PAYER_A);
    expect(payerAPush?.vars).toMatchObject({ title: 'Friday 7s', amount: '37.00' });
    expect(payerAPush?.data).toMatchObject({ type: 'refund-credited', matchId: MATCH_ID });
    const hostPitchPush = refundPushes.find((p) => p.users[0] === HOST);
    expect(hostPitchPush?.vars).toMatchObject({ amount: '120.00' });
  });

  it('no fee rows ⇒ no refund pushes at all (free match)', async () => {
    const { svc, pushes } = makeHarness({
      match: { ...baseMatch, booking_mode: 'self', booking_slot_id: null, pitch_cost_sar: null },
      payers: [],
    });

    await svc.cancelMatch(HOST, MATCH_ID);

    expect(pushes.filter((p) => p.key === 'refund_credited')).toHaveLength(0);
  });
});

describe('P2-193 — removePlayer refund push', () => {
  it('removed payer gets refund_credited quoting the fee; non-payer gets none', async () => {
    const paid = makeHarness({
      match: { id: MATCH_ID, host_id: HOST, status: 'Open' },
      player: { id: 'mp-1', fee_paid_sar: '25.00' },
    });
    await paid.svc.removePlayer(HOST, MATCH_ID, PAYER_A);
    const paidPush = paid.pushes.find((p) => p.key === 'refund_credited');
    expect(paidPush).toBeDefined();
    expect(paidPush?.users).toEqual([PAYER_A]);
    expect(paidPush?.vars).toMatchObject({ title: 'Friday 7s', amount: '25.00' });
    expect(paidPush?.data).toMatchObject({ type: 'refund-credited', matchId: MATCH_ID });

    const free = makeHarness({
      match: { id: MATCH_ID, host_id: HOST, status: 'Open' },
      player: { id: 'mp-1', fee_paid_sar: null },
    });
    await free.svc.removePlayer(HOST, MATCH_ID, PAYER_A);
    expect(free.pushes.filter((p) => p.key === 'refund_credited')).toHaveLength(0);
  });
});
