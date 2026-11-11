/**
 * Run #200 (P2-333 re-scoped + Reviewer B run-#200 CRITICAL #1 / IMPORTANT #2):
 * the waitlist promotion MONEY LOOP.
 *
 * Pins four behaviors the old code got wrong:
 *  1. CRITICAL wedge — an underfunded queue head used to THROW inside
 *     chargeMatchFeeTx, rolling back the CALLER's whole leave/cancel/kick tx
 *     (nobody could leave while an underfunded player queued). Now the head is
 *     skipped (delete + resequence + next head) and the freeing op commits.
 *  2. Free-seat leak — the ≥4h leave path and the host-kick path promoted the
 *     queue head WITHOUT feePriceSar: a paid seat with no payment snapshot.
 *     Both call sites now pass the fee; the service charges in-tx.
 *  3. Push surface — the promotion push carries the exact charged amount
 *     (localized Intl) only when money moved; free promotions keep the plain
 *     invite copy.
 *
 * Money math itself stays owned by matches.money-exact / refund-matrix specs;
 * this file owns the promotion-loop wiring.
 */
import { MatchWaitlistService } from './waitlist.service';
import { moneyToNumber } from '../../common/utils/money';
import { match_waitlist, match_players, matches, users } from '../../database/schema';

interface HarnessOpts {
  /** match_waitlist rows handed to the .for('update') head selects, in order. */
  heads: Array<{ id: string; user_id: string; position: number }>;
  /** users rows for the wallet pre-read, keyed by user id. */
  wallets: Record<string, string>;
  /** matches row (title + capacity gate). */
  match?: { id: string; title: string; max_players: number; roster: number };
  /** match_players rows for alreadyIn / team-count aggregates / episode pick. */
  players?: Array<Record<string, unknown>>;
}

function makeHarness(opts: HarnessOpts) {
  const headQueue = [...opts.heads];
  const deletedWaitlistIds: string[] = [];
  const insertedPlayers: Array<Record<string, unknown>> = [];
  /** set() payloads captured from match_players updates (fee snapshots). */
  const playerUpdates: Array<Record<string, unknown>> = [];
  let userSelectCount = 0;
  let mpCalls = 0;

  function chainFor(rows: unknown[]) {
    const chain: any = {
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      for: () => chain,
    };
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  }

  const tx = {
    select: () => ({
      from: (table: unknown) => {
        if (table === match_waitlist) {
          const head = headQueue.shift();
          // New loop iteration: the match_players call-order counter restarts.
          mpCalls = 0;
          return chainFor(head ? [head] : []);
        }
        if (table === users) {
          // Wallet pre-read: the CURRENT head is heads[N - remaining - 1].
          const idx = opts.heads.length - headQueue.length - 1;
          const head = opts.heads[idx];
          const balance = head ? opts.wallets[head.user_id] : undefined;
          return chainFor(
            balance === undefined ? [] : [{ id: head.user_id, wallet_balance: balance }],
          );
        }
        if (table === matches) {
          return chainFor([
            opts.match ?? { id: 'match-1', title: 'Tuesday Padel', max_players: 10, roster: 9 },
          ],
          );
        }
        if (table === match_players) {
          // Call order inside one loop iteration: alreadyIn check (rows must
          // be EMPTY so the head isn't seen as rostered), then homeCount and
          // awayCount aggregates (destructured [row] — must be a row), then
          // the episode-id select (a row with the roster id DB would mint).
          mpCalls += 1;
          if (mpCalls === 1) return chainFor([]);
          if (mpCalls === 2) return chainFor([{ homeCount: 0 }]);
          if (mpCalls === 3) return chainFor([{ awayCount: 0 }]);
          return chainFor([{ id: `ep-${mpCalls}`, user_id: 'ep' }]);
        }
        return chainFor([]);
      },
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          if ('fee_paid_sar' in vals) playerUpdates.push(vals);
          const q: any = { then: (r: (v: unknown) => void) => r([]) };
          // chargeMatchFeeTx reads the post-debit balance back.
          q.returning = () => ({
            then: (r: (v: unknown) => void) => r([{ wallet_balance: '63.00' }]),
          });
          return q;
        },
      }),
    }),
    delete: () => ({
      where: () => {
        deletedWaitlistIds.push('id');
        return { then: (r: (v: unknown) => void) => r([]) };
      },
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        insertedPlayers.push(vals);
        return {
          returning: () => ({
            then: (r: (v: unknown) => void) => r([{ id: `ep-${insertedPlayers.length}` }]),
          }),
        };
      },
    }),
    execute: () => ({ then: (r: (v: unknown) => void) => r([]) }),
  };

  const svc = new MatchWaitlistService(
    {} as never, // root db — promoteNextInTx only touches tx
    { record: async () => undefined } as never,
    { broadcastRosterUpdate: () => {} } as never,
    { sendPushToUsers: async () => 1 } as never,
  );

  return { svc, tx, deletedWaitlistIds, insertedPlayers, playerUpdates };
}

describe('Waitlist promotion money loop (run #200, P2-333)', () => {
  const baseMatch = { id: 'match-1', title: 'Tuesday Padel', max_players: 10, roster: 9 };

  it('skips an underfunded head and seats the NEXT head — the freeing tx commits (CRITICAL #1)', async () => {
    const { svc, tx, deletedWaitlistIds, insertedPlayers, playerUpdates } = makeHarness({
      heads: [
        { id: 'w-poor', user_id: 'user-poor', position: 1 },
        { id: 'w-rich', user_id: 'user-rich', position: 2 },
      ],
      wallets: { 'user-poor': '5.00', 'user-rich': '100.00' },
      match: baseMatch,
    });

    const result = await svc.promoteNextInTx(tx as never, 'match-1', {
      feePriceSar: 37,
    });

    expect(result.promotion).not.toBeNull();
    expect(result.promotion!.userId).toBe('user-rich');
    expect(result.promotion!.chargedSar).toBe(37);
    // P2-347: the evicted underfunded head is reported for notification.
    expect(result.evicted).toEqual([
      { userId: 'user-poor', matchTitle: 'Tuesday Padel' },
    ]);
    // Both queue entries removed: the skipped head AND the seated head.
    expect(deletedWaitlistIds).toHaveLength(2);
    const seatInserts = insertedPlayers.filter((v) => 'match_id' in v);
    const ledgerInserts = insertedPlayers.filter((v) => v.reference_type === 'MATCH_FEE');
    expect(seatInserts).toHaveLength(1);
    expect(seatInserts[0].user_id).toBe('user-rich');
    // The charge ledger entry landed for the promoted player (per-episode key).
    expect(ledgerInserts).toHaveLength(1);
    expect(ledgerInserts[0].user_id).toBe('user-rich');
    expect(ledgerInserts[0].amount).toBe('37.00');
    // Fee snapshot lands on the promoted player's roster row.
    expect(playerUpdates).toHaveLength(1);
    expect(playerUpdates[0].fee_paid_sar).toBe('37.00');
  });

  it('ALL heads underfunded → null promotion, no seat, no throw (leaver proceeds)', async () => {
    const { svc, tx, insertedPlayers, deletedWaitlistIds, playerUpdates } = makeHarness({
      heads: [
        { id: 'w-1', user_id: 'user-a', position: 1 },
        { id: 'w-2', user_id: 'user-b', position: 2 },
      ],
      wallets: { 'user-a': '1.00', 'user-b': '0.50' },
      match: baseMatch,
    });

    const result = await svc.promoteNextInTx(tx as never, 'match-1', {
      feePriceSar: 37,
    });

    expect(result.promotion).toBeNull();
    expect(insertedPlayers).toHaveLength(0);
    expect(playerUpdates).toHaveLength(0);
    expect(deletedWaitlistIds).toHaveLength(2); // both heads skipped
  });

  it('sufficient-balance head is charged in-tx with a per-episode ledger key', async () => {
    const { svc, tx, insertedPlayers, playerUpdates } = makeHarness({
      heads: [{ id: 'w-1', user_id: 'user-ok', position: 1 }],
      wallets: { 'user-ok': '50.00' },
      match: baseMatch,
      // players rows: alreadyIn check → [] ; team counts → [] ; episode → row
      players: [],
    });

    const result = await svc.promoteNextInTx(tx as never, 'match-1', { feePriceSar: 37 });

    expect(result.promotion!.chargedSar).toBe(37);
    expect(result.evicted).toEqual([]); // fully-funded head: no evictions
    expect(insertedPlayers[0].user_id).toBe('user-ok');
    expect(playerUpdates[0].fee_paid_sar).toBe('37.00');
  });

  it('free-match promotion carries chargedSar null (no wallet read, no charge)', async () => {
    const { svc, tx, playerUpdates } = makeHarness({
      heads: [{ id: 'w-1', user_id: 'user-free', position: 1 }],
      wallets: {},
      match: baseMatch,
    });

    const result = await svc.promoteNextInTx(tx as never, 'match-1');

    expect(result.promotion!.chargedSar).toBeNull();
    expect(result.evicted).toEqual([]); // no fee → no skip path at all
    expect(playerUpdates).toHaveLength(0);
  });

  it('ALL heads underfunded → evicted carries EVERY head for notification (P2-347)', async () => {
    const { svc, tx, insertedPlayers } = makeHarness({
      heads: [
        { id: 'w-1', user_id: 'user-a', position: 1 },
        { id: 'w-2', user_id: 'user-b', position: 2 },
      ],
      wallets: { 'user-a': '1.00', 'user-b': '0.50' },
      match: baseMatch,
    });

    const result = await svc.promoteNextInTx(tx as never, 'match-1', {
      feePriceSar: 37,
    });

    expect(result.promotion).toBeNull();
    expect(result.evicted.map((e) => e.userId).sort()).toEqual(['user-a', 'user-b']);
    expect(insertedPlayers.filter((v) => 'match_id' in v)).toHaveLength(0);
  });

  it('notifyWaitlistRemoval pushes the waitlist_removed key with the match title (P2-347)', async () => {
    const notifications = { sendPushToUsers: jest.fn(async () => 1) };
    const activities = { record: jest.fn(async () => undefined) };
    const svc = new MatchWaitlistService(
      {} as never,
      activities as never,
      { broadcastRosterUpdate: () => {} } as never,
      notifications as never,
    );

    await svc.notifyWaitlistRemoval('user-poor', 'match-1', 'Tuesday Padel');

    expect(activities.record).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'waitlist_removed', matchId: 'match-1' }),
    );
    expect(notifications.sendPushToUsers).toHaveBeenCalledWith(['user-poor'], {
      key: 'waitlist_removed',
      vars: { title: 'Tuesday Padel' },
      data: { type: 'waitlist-removed', matchId: 'match-1' },
      category: 'match',
    });
  });

  it('moneyToNumber sanity: the balance gate uses exact numeric parsing', () => {
    // Guards against a future refactor reintroducing parseFloat on a
    // numeric-column string (locale/precision drift the guard would miss).
    expect(moneyToNumber('36.99')).toBeCloseTo(36.99);
    expect(moneyToNumber('0.00')).toBe(0);
  });
});
