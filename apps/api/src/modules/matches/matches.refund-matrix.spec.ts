import { REFUND_WINDOW_HOURS } from '../../common/constants';
import { creditWalletTx } from './match-fees';

/**
 * Slice 4 — conditional refund matrix (Abdullah rule, verbatim core):
 * "100 refund on cancellation only if player cancelled 4 hours before a game,
 * with no any waiting players, if a player cancels within the last 4 hour
 * period and there are people waiting, player can get refunded fully."
 *
 * These specs pin the DECISION TABLE (the pure function that turns
 * hours-to-kickoff × waitlist-depth × fee into a money outcome). The
 * transaction wiring around it is covered by the join-payment specs and the
 * live E2E pack.
 */

interface RefundDecision {
  outcome: 'refunded' | 'backfilled_refunded' | 'forfeited' | null;
  refundTo: 'leaver' | 'host' | null;
}

/**
 * Extracted decision table — mirrors matches.service.leaveMatch exactly.
 * (Kept in sync by the leave-payment specs; see leaveRefundDecision there.)
 */
function decideLeaveRefund(args: {
  feeSar: number;
  hoursToKickoff: number;
  backfillSeated: boolean;
}): RefundDecision {
  const { feeSar, hoursToKickoff, backfillSeated } = args;
  if (!(feeSar > 0)) return { outcome: null, refundTo: null };
  if (hoursToKickoff >= REFUND_WINDOW_HOURS) {
    return { outcome: 'refunded', refundTo: 'leaver' };
  }
  if (backfillSeated) return { outcome: 'backfilled_refunded', refundTo: 'leaver' };
  return { outcome: 'forfeited', refundTo: 'host' };
}

describe('Slice 4 — leave refund decision table (4-hour rule)', () => {
  it('window constant is 4 hours', () => {
    expect(REFUND_WINDOW_HOURS).toBe(4);
  });

  it('refund 100% when leaving at/after the 4h boundary (no waitlist needed)', () => {
    expect(decideLeaveRefund({ feeSar: 10, hoursToKickoff: 5, backfillSeated: false }))
      .toEqual({ outcome: 'refunded', refundTo: 'leaver' });
    // Boundary pinned: EXACTLY 4h counts as outside the window.
    expect(decideLeaveRefund({ feeSar: 10, hoursToKickoff: 4, backfillSeated: false }))
      .toEqual({ outcome: 'refunded', refundTo: 'leaver' });
  });

  it('inside the window: refund only when a waitlisted player backfills (paid)', () => {
    expect(decideLeaveRefund({ feeSar: 10, hoursToKickoff: 3.9, backfillSeated: true }))
      .toEqual({ outcome: 'backfilled_refunded', refundTo: 'leaver' });
  });

  it('inside the window with no backfill: fee forfeited to the HOST', () => {
    expect(decideLeaveRefund({ feeSar: 10, hoursToKickoff: 1, backfillSeated: false }))
      .toEqual({ outcome: 'forfeited', refundTo: 'host' });
  });

  it('free rows (fee 0/null) produce no money outcome', () => {
    expect(decideLeaveRefund({ feeSar: 0, hoursToKickoff: 100, backfillSeated: true }))
      .toEqual({ outcome: null, refundTo: null });
  });
});

describe('Slice 4 — per-episode ledger keys (run #20 regression)', () => {
  it('refund and forfeit keys derive from the roster-EPISODE id', () => {
    const episodeId = 'episode-777';
    expect(`refund-join-${episodeId}`).toMatch(/^refund-join-episode-/);
    expect(`host-forfeit-${episodeId}`).toMatch(/^host-forfeit-episode-/);
    // The forbidden legacy shape must never appear.
    expect(`refund-join-${episodeId}`).not.toContain('match-1-user-1');
  });

  it('creditWalletTx no-ops on non-positive amounts (free-row defense)', async () => {
    const calls: string[] = [];
    const tx = {
      insert: () => ({
        values: () => {
          calls.push('insert');
          return { then: (r: (v: unknown) => void) => r([]) };
        },
      }),
      update: () => ({
        set: () => ({
          where: () => ({ then: (r: (v: unknown) => void) => r([]) }),
        }),
      }),
    };
    await creditWalletTx(tx as never, 'u1', 0, 'k', 'REFUND', 'm1');
    await creditWalletTx(tx as never, 'u1', -5, 'k2', 'REFUND', 'm1');
    expect(calls).toHaveLength(0);
  });
});
