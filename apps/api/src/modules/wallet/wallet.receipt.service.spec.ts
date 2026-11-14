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

  it('zero-payout release (no PRIZE row) shows payout 0 — ledger-authoritative, never derived', async () => {
    const { svc } = makeDb({
      match: [RELEASED_MATCH],
      feeTotal: '10.00',
      payers: 2,
      episodes: [{ id: 'ep-1' }],
      forfeitTotal: '5.00',
      forfeitCount: 1,
      prize: null,
    });

    const r = await svc.getPayoutReceipt(HOST, MATCH);
    // PR-Agent r1 PR #211: a no-row release must display 0, not a
    // margin-derived number (post-release margin drift could show money
    // that was never credited).
    expect(r.payoutSar).toBe(0);
    expect(r.totalCreditedSar).toBe(5);
    expect(r.breakdown.platformFeeSar).toBe(10);
  });

  it('post-release margin change cannot distort the breakdown (platformFee = pool − payout)', async () => {
    // Released when margin was 5 (pool 72 − 15 = 57 credited); margin NOW 1.
    // The receipt must still reconcile to the ledger, not the live setting.
    const { svc } = makeDb(
      {
        match: [RELEASED_MATCH],
        feeTotal: '72.00',
        payers: 3,
        episodes: [{ id: 'ep-1' }],
        forfeitTotal: '0',
        forfeitCount: 0,
        prize: [{ amount: '57.00' }],
      },
      1,
    );
    const r = await svc.getPayoutReceipt(HOST, MATCH);
    expect(r.payoutSar).toBe(57);
    expect(r.breakdown.platformFeeSar).toBe(15);
    expect(r.breakdown.perJoinerFeeSar).toBe(5);
    expect(r.totalCreditedSar).toBe(57);
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

// ──────────────────────────────────────────────────────────────
// F5 (run #206, D-20261106-13) — player transaction receipt contract:
// 1. Owner-only: missing row or another user's row → 404.
// 2. MATCH_FEE / REFUND → match context (title + scheduled date + venue) via
//    matches→pitches→venues; missing match degrades to generic (no fabricate).
// 3. TOPUP → paymentId from reference_id (Moyasar payment id).
// 4. Other ledger types → generic context (still a proof-of-payment).
// 5. Receipt number is deterministic: KL-<yyyyMMdd>-<first6 tx id>.
// ──────────────────────────────────────────────────────────────

interface TxRows {
  tx: Array<Record<string, unknown>> | null;
  matchCtx: Array<Record<string, unknown>> | null;
}

function makeTxDb(rows: TxRows) {
  const settings = { getNumber: async (_k: string, d: number) => d };
  const db = {
    select: (fields: Record<string, unknown> = {}) => ({
      from: (_table: unknown) => {
        const b: Record<string, unknown> = {};
        b.leftJoin = () => b;
        b.where = () => b;
        b.limit = () => b;
        b.then = (resolve: (v: unknown) => void) => {
          let out: unknown = [];
          if ('venue_name' in fields) out = rows.matchCtx ?? [];
          else if ('user_id' in fields) out = rows.tx ?? [];
          resolve(out);
        };
        return b;
      },
    }),
  };
  return { svc: new WalletReceiptService(db as never, settings as never) };
}

const USER = 'user-1';
const TX_ID = 'a1b2c3d4-0000-0000-0000-000000000000';
const TX_CREATED = new Date('2026-11-14T09:30:00Z');

const TX_BASE = {
  id: TX_ID,
  user_id: USER,
  amount: '37.00',
  reference_id: null,
  status: 'Completed',
  created_at: TX_CREATED,
};

describe('WalletReceiptService — F5 player transaction receipt', () => {
  it('MATCH_FEE debit → match context with venue (matches→pitches→venues join)', async () => {
    const { svc } = makeTxDb({
      tx: [{ ...TX_BASE, type: 'DEBIT', reference_type: 'MATCH_FEE', reference_id: 'm-9' }],
      matchCtx: [
        {
          id: 'm-9',
          title: 'Sunset 7v7 Rooftop',
          scheduled_at: new Date('2026-11-15T18:00:00Z'),
          venue_name: 'Riyadh Padel Club',
          city: 'Riyadh',
        },
      ],
    });
    const r = await svc.getTransactionReceipt(USER, TX_ID);
    expect(r).toMatchObject({
      txId: TX_ID,
      receiptNumber: 'KL-20261114-A1B2C3',
      status: 'Completed',
      direction: 'debit',
      amountSar: 37,
      currency: 'SAR',
      context: {
        kind: 'match',
        matchId: 'm-9',
        matchTitle: 'Sunset 7v7 Rooftop',
        scheduledAt: '2026-11-15T18:00:00.000Z',
        venueName: 'Riyadh Padel Club',
        city: 'Riyadh',
      },
    });
    expect(r.createdAt).toBe('2026-11-14T09:30:00.000Z');
    expect(typeof r.issuedAt).toBe('string');
  });

  it('REFUND credit → same match context, direction credit', async () => {
    const { svc } = makeTxDb({
      tx: [{ ...TX_BASE, type: 'CREDIT', reference_type: 'REFUND', reference_id: 'm-9' }],
      matchCtx: [
        {
          id: 'm-9',
          title: 'Sunset 7v7 Rooftop',
          scheduled_at: new Date('2026-11-15T18:00:00Z'),
          venue_name: null,
          city: null,
        },
      ],
    });
    const r = await svc.getTransactionReceipt(USER, TX_ID);
    expect(r.direction).toBe('credit');
    expect(r.context).toEqual({
      kind: 'match',
      matchId: 'm-9',
      matchTitle: 'Sunset 7v7 Rooftop',
      scheduledAt: '2026-11-15T18:00:00.000Z',
      venueName: null,
      city: null,
    });
  });

  it('TOPUP credit → paymentId context (Moyasar payment id), no match query', async () => {
    const { svc } = makeTxDb({
      tx: [
        {
          ...TX_BASE,
          type: 'CREDIT',
          reference_type: 'TOPUP',
          reference_id: 'pay_moyasar_123',
        },
      ],
      matchCtx: null, // must never be consulted
    });
    const r = await svc.getTransactionReceipt(USER, TX_ID);
    expect(r.context).toEqual({ kind: 'topup', paymentId: 'pay_moyasar_123' });
  });

  it('TOPUP with null reference_id → paymentId null', async () => {
    const { svc } = makeTxDb({
      tx: [{ ...TX_BASE, type: 'CREDIT', reference_type: 'TOPUP' }],
      matchCtx: null,
    });
    const r = await svc.getTransactionReceipt(USER, TX_ID);
    expect(r.context).toEqual({ kind: 'topup', paymentId: null });
  });

  it('ADJUSTMENT (generic ledger row) → generic context', async () => {
    const { svc } = makeTxDb({
      tx: [{ ...TX_BASE, type: 'CREDIT', reference_type: 'ADJUSTMENT' }],
      matchCtx: null,
    });
    const r = await svc.getTransactionReceipt(USER, TX_ID);
    expect(r.context).toEqual({ kind: 'generic' });
  });

  it('MATCH_FEE whose match row is gone → degrades to generic (no fabricated context)', async () => {
    const { svc } = makeTxDb({
      tx: [{ ...TX_BASE, type: 'DEBIT', reference_type: 'MATCH_FEE', reference_id: 'm-gone' }],
      matchCtx: null,
    });
    const r = await svc.getTransactionReceipt(USER, TX_ID);
    expect(r.context).toEqual({ kind: 'generic' });
  });

  it.each([
    ['missing tx', null],
    ['another user tx', [{ ...TX_BASE, user_id: 'someone-else' }]],
  ])('404: %s', async (_label, tx) => {
    const { svc } = makeTxDb({ tx: tx as Array<Record<string, unknown>> | null, matchCtx: null });
    await expect(svc.getTransactionReceipt(USER, TX_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('receipt number is deterministic per tx + created date', () => {
    expect(
      WalletReceiptService.buildReceiptNumber({ id: TX_ID, created_at: TX_CREATED }),
    ).toBe('KL-20261114-A1B2C3');
    expect(
      WalletReceiptService.buildReceiptNumber({ id: TX_ID, created_at: TX_CREATED }),
    ).toBe(
      WalletReceiptService.buildReceiptNumber({ id: TX_ID, created_at: TX_CREATED }),
    );
  });
});
