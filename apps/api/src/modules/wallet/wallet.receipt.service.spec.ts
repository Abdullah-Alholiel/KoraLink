import { NotFoundException } from '@nestjs/common';
import { matches, match_players, transactions } from '../../database/schema';
import { WalletReceiptService } from './wallet.receipt.service';

/**
 * P2-293 (run #185) — host payout receipt contract:
 * 1. Math mirrors releaseHostPayoutInTx: payout = round2(max(0, Σfee − margin×payers)),
 *    PRIZE ledger row authoritative when present (roster may have drifted post-release).
 * 2. Owner-only: non-host / non-player-hosted / not-released / missing match → 404.
 * 3. Forfeits sum the host's `host-forfeit-<episodeId>` ADJUSTMENT rows (episode-scoped),
 *    reported SEPARATELY from the PRIZE release credit.
 * 4. Zero-payout release (no PRIZE row) falls back to the derived floor.
 */

const HOST = 'host-1';
const MATCH = 'm-1';

interface Rows {
  match: Array<Record<string, unknown>> | null;
  feeTotal: string;
  payers: number;
  episodes: Array<{ id: string }>;
  forfeitTotal: string;
  forfeitCount: number;
  prize: Array<Record<string, unknown>> | null;
}

function makeDb(rows: Rows, margin = 5) {
  const settings = { getNumber: async (_k: string, d: number) => margin };
  const db = {
    // Route by the SHAPE of the select() projection — immune to call order.
    select: (fields: Record<string, unknown> = {}) => ({
      from: (_table: unknown) => {
        const b: Record<string, unknown> = {};
        b.where = () => b;
        b.limit = () => b;
        b.then = (resolve: (v: unknown) => void) => {
          let out: unknown = [];
          if ('host_payout_state' in fields) out = rows.match ?? [];
          else if ('payers' in fields) out = [{ total: rows.feeTotal, payers: rows.payers }];
          else if ('id' in fields) out = rows.episodes;
          else if ('n' in fields) out = [{ total: rows.forfeitTotal, n: rows.forfeitCount }];
          else if ('amount' in fields) out = rows.prize ?? [];
          resolve(out);
        };
        return b;
      },
    }),
  };
  return { svc: new WalletReceiptService(db as never, settings as never) };
}

const RELEASED_MATCH = {
  id: MATCH,
  title: 'Sunset 7v7 Rooftop',
  host_id: HOST,
  is_player_hosted: true,
  host_payout_state: 'released',
  completed_at: new Date('2026-11-04T10:00:00Z'),
};

describe('WalletReceiptService — P2-293 host payout receipt', () => {
  it('full math: pool 72 / 3 payers / margin 5 → payout 57 + forfeit 5, total 62', async () => {
    const { svc } = makeDb({
      match: [RELEASED_MATCH],
      feeTotal: '72.00',
      payers: 3,
      episodes: [{ id: 'ep-1' }, { id: 'ep-2' }, { id: 'ep-3' }, { id: 'ep-4' }],
      forfeitTotal: '5.00',
      forfeitCount: 1,
      prize: [{ amount: '57.00' }],
    });

    const r = await svc.getPayoutReceipt(HOST, MATCH);
    expect(r).toEqual({
      matchId: MATCH,
      matchTitle: 'Sunset 7v7 Rooftop',
      completedAt: '2026-11-04T10:00:00.000Z',
      currency: 'SAR',
      payoutSar: 57,
      forfeitSar: 5,
      forfeits: 1,
      totalCreditedSar: 62,
      breakdown: { feePoolSar: 72, payers: 3, platformFeeSar: 15, perJoinerFeeSar: 5 },
    });
  });

  it('PRIZE row is authoritative over the derived amount (roster drift after release)', async () => {
    const { svc } = makeDb({
      match: [RELEASED_MATCH],
      feeTotal: '90.00', // derived would be 75
      payers: 3,
      episodes: [],
      forfeitTotal: '0',
      forfeitCount: 0,
      prize: [{ amount: '57.00' }],
    });

    const r = await svc.getPayoutReceipt(HOST, MATCH);
    expect(r.payoutSar).toBe(57);
    expect(r.forfeitSar).toBe(0);
    expect(r.totalCreditedSar).toBe(57);
  });

  it('zero-payout release (no PRIZE row) falls back to the derived floor', async () => {
    const { svc } = makeDb({
      match: [RELEASED_MATCH],
      feeTotal: '10.00', // 10 − 5×2 → floored 0
      payers: 2,
      episodes: [{ id: 'ep-1' }],
      forfeitTotal: '5.00',
      forfeitCount: 1,
      prize: null,
    });

    const r = await svc.getPayoutReceipt(HOST, MATCH);
    expect(r.payoutSar).toBe(0);
    expect(r.totalCreditedSar).toBe(5);
    expect(r.breakdown.platformFeeSar).toBe(10);
  });

  it('empty roster → no forfeit query, zero sums', async () => {
    const { svc } = makeDb({
      match: [RELEASED_MATCH],
      feeTotal: '0',
      payers: 0,
      episodes: [],
      forfeitTotal: '0',
      forfeitCount: 0,
      prize: null,
    });
    const r = await svc.getPayoutReceipt(HOST, MATCH);
    expect(r.payoutSar).toBe(0);
    expect(r.forfeits).toBe(0);
    expect(r.breakdown.payers).toBe(0);
  });

  it.each([
    ['missing match', null],
    [
      'not the host',
      [{ ...RELEASED_MATCH, host_id: 'someone-else' }],
    ],
    ['not player-hosted', [{ ...RELEASED_MATCH, is_player_hosted: false }]],
    ['payout not released (held)', [{ ...RELEASED_MATCH, host_payout_state: 'held' }]],
    ['payout cancelled', [{ ...RELEASED_MATCH, host_payout_state: 'cancelled' }]],
  ])('404: %s', async (_label, match) => {
    const { svc } = makeDb({
      match: match as Array<Record<string, unknown>> | null,
      feeTotal: '0',
      payers: 0,
      episodes: [],
      forfeitTotal: '0',
      forfeitCount: 0,
      prize: null,
    });
    await expect(svc.getPayoutReceipt(HOST, MATCH)).rejects.toThrow(
      NotFoundException,
    );
  });
});
