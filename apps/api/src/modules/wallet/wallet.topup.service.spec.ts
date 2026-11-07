import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WalletTopupService, sarToHalalas } from './wallet.topup.service';
import { MoyasarHttpError } from '../../common/moyasar/moyasar.client';

/**
 * P0-2 (run #169) — Moyasar wallet top-up service specs.
 *
 * Security-critical paths: flag gating, amount bounds, intent ownership,
 * paid/currency/amount assertions before ANY credit, single-tx credit+flip,
 * and idempotent replay (sequential + race). DB is a stubbed Drizzle chain;
 * the Moyasar client is jest-mocked so nothing here touches the network.
 */

jest.mock('../../common/moyasar/moyasar.client', () => ({
  ...jest.requireActual('../../common/moyasar/moyasar.client'),
  fetchMoyasarPayment: jest.fn(),
}));

import { fetchMoyasarPayment } from '../../common/moyasar/moyasar.client';
const mockFetch = fetchMoyasarPayment as jest.Mock;

const INTENT_ROW = {
  id: 'intent-1',
  user_id: 'user-1',
  amount_halalas: 5000,
  currency: 'SAR',
  status: 'pending',
  payment_id: null,
  idempotency_key: 'topup-intent:user-1:key-1',
  created_at: new Date('2026-10-27T10:00:00Z'),
  updated_at: new Date('2026-10-27T10:00:00Z'),
};

const PAID_PAYMENT = {
  id: 'pay_test1234567890',
  status: 'paid',
  amount: 5000,
  currency: 'SAR',
  description: 'wallet-topup:intent-1',
  source: { type: 'creditcard', company: 'mada', message: null },
};

type TableKey = 'intent' | 'tx' | 'user';

/** Minimal Drizzle-shaped db stub; select().from(table) resolves by table key. */
function makeDb(overrides: {
  intentRows?: unknown[];
  /** Queue of per-select result sets for the intents table (first = pre-insert, later = replays). */
  intentSelectQueue?: unknown[][];
  txRows?: unknown[];
  balanceRows?: unknown[];
  insertIntentReturning?: unknown[];
  txInsertReturning?: unknown[];
  txUpdateUserReturning?: unknown[];
  /** P2-282: rows returned by the in-tx intent flip (empty = lost the race). */
  txUpdateIntentReturning?: unknown[];
  insertThrowsUnique?: boolean;
} = {}) {
  const o = {
    intentRows: [INTENT_ROW],
    intentSelectQueue: undefined as unknown[][] | undefined,
    txRows: [],
    balanceRows: [{ wallet_balance: '150.00' }],
    insertIntentReturning: [{ ...INTENT_ROW }],
    txInsertReturning: [{ amount: '50.00', id: 'tx-1' }],
    txUpdateUserReturning: [{ id: 'user-1', wallet_balance: '150.00' }],
    txUpdateIntentReturning: [{ id: 'intent-1' }],
    insertThrowsUnique: false,
    ...overrides,
  };

  const pick = (table: unknown): unknown[] => {
    const cols = (table as { [key: string]: unknown }) ?? {};
    // transactions carries idempotency_key; wallet_topup_intents carries
    // amount_halalas; users carries wallet_balance — cheap discriminator.
    if ('amount_halalas' in cols) {
      if (o.intentSelectQueue && o.intentSelectQueue.length > 0) {
        return o.intentSelectQueue.shift() ?? [];
      }
      return o.intentRows;
    }
    if ('idempotency_key' in cols) return o.txRows;
    if ('wallet_balance' in cols) return o.balanceRows;
    return [];
  };

  const selectChain = () => ({
    from: (_table: unknown) => ({
      where: () => ({
        limit: async () => pick(_table),
      }),
    }),
  });

  return {
    select: () => selectChain(),
    insert: () => ({
      values: () => ({
        returning: async () => {
          if (o.insertThrowsUnique) {
            const err = new Error('unique violation') as Error & { code: string; constraint: string };
            err.code = '23505';
            err.constraint = 'wallet_topup_intents_idempotency_key_unique';
            throw err;
          }
          return o.insertIntentReturning;
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({}),
      }),
    }),
    /** Ledger rows inserted by tx callbacks that COMMITTED (rolled-back ones are dropped). */
    committedLedgerInserts: [] as unknown[],
    transaction: jest.fn(async function (this: { committedLedgerInserts: unknown[] }, fn: (tx: never) => unknown) {
      const pending: unknown[] = [];
      const result = await fn({
        insert: () => ({
          values: (v: unknown) => ({
            returning: async () => {
              pending.push(v);
              return o.txInsertReturning;
            },
          }),
        }),
        update: (table: unknown) => ({
          set: () => ({
            where: () => ({
              returning: async () =>
                'amount_halalas' in ((table as Record<string, unknown>) ?? {})
                  ? o.txUpdateIntentReturning
                  : o.txUpdateUserReturning,
            }) as never,
          }),
        }),
      } as never);
      this.committedLedgerInserts.push(...pending);
      return result;
    }),
  };
}

function makeService(db: unknown, env: Record<string, string | undefined>) {
  const configService = {
    get: jest.fn().mockImplementation((key: string) => env[key]),
  } as any;
  return new WalletTopupService(db as never, configService);
}

const ENV_OFF = { WALLET_TOPUP_ENABLED: undefined };
const ENV_ON = {
  WALLET_TOPUP_ENABLED: 'true',
  MOYASAR_SECRET_KEY_TEST: 'sk_test_dummy_for_specs',
  MOYASAR_PUBLISHABLE_KEY_TEST: 'pk_test_dummy_for_specs',
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('sarToHalalas', () => {
  it('converts SAR to halalas exactly', () => {
    expect(sarToHalalas(50)).toBe(5000);
    expect(sarToHalalas(10.5)).toBe(1050);
    expect(sarToHalalas(0.99)).toBe(99);
  });
  it('rejects non-positive results', () => {
    expect(() => sarToHalalas(0)).toThrow(BadRequestException);
    expect(() => sarToHalalas(-5)).toThrow(BadRequestException);
  });
});

describe('getTopupConfig', () => {
  it('withholds the key and reports disabled when the flag is off', () => {
    const svc = makeService(makeDb(), { ...ENV_OFF, MOYASAR_PUBLISHABLE_KEY_TEST: 'pk_x' });
    expect(svc.getTopupConfig()).toEqual({
      enabled: false,
      publishableKey: null,
      minAmount: 5,
      maxAmount: 2000,
    });
  });
  it('reports enabled with the key when flag + key are present', () => {
    const svc = makeService(makeDb(), ENV_ON);
    const cfg = svc.getTopupConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.publishableKey).toBe('pk_test_dummy_for_specs');
    expect(cfg.minAmount).toBe(5);
    expect(cfg.maxAmount).toBe(2000);
  });
});

describe('createTopupIntent', () => {
  const dto = { amountSar: 50, idempotencyKey: 'key-1' };

  it('403s when the flag is off', async () => {
    const svc = makeService(makeDb(), ENV_OFF);
    await expect(svc.createTopupIntent('user-1', dto)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('inserts with scoped key + halalas when no prior intent exists', async () => {
    const db = makeDb({ intentRows: [] });
    const svc = makeService(db, ENV_ON);
    const res = await svc.createTopupIntent('user-1', dto);
    expect(res.intent.idempotency_key).toBe('topup-intent:user-1:key-1');
    expect(res.publishableKey).toBe('pk_test_dummy_for_specs');
  });
  it('replays the ORIGINAL intent for a same-user retry', async () => {
    const db = makeDb({ intentRows: [{ ...INTENT_ROW, amount_halalas: 2500 }] });
    const svc = makeService(db, ENV_ON);
    const res = await svc.createTopupIntent('user-1', dto);
    expect(res.intent.amount_halalas).toBe(2500);
  });
  it('409s when the key belongs to a DIFFERENT user (no row leak)', async () => {
    const db = makeDb({ intentRows: [{ ...INTENT_ROW, user_id: 'someone-else' }] });
    const svc = makeService(db, ENV_ON);
    await expect(svc.createTopupIntent('user-1', dto)).rejects.toBeInstanceOf(ConflictException);
  });
  it('serves the winner row on a unique-violation race (same user)', async () => {
    const db = makeDb({
      intentSelectQueue: [
        [], // pre-insert check: no prior intent
        [{ ...INTENT_ROW }], // race re-select: the winner's row
      ],
      insertThrowsUnique: true,
    });
    const svc = makeService(db, ENV_ON);
    const res = await svc.createTopupIntent('user-1', { amountSar: 50, idempotencyKey: 'key-1' });
    expect(res.intent.user_id).toBe('user-1');
    expect(res.intent.amount_halalas).toBe(5000);
  });
});

describe('verifyTopup', () => {
  const dto = { paymentId: 'pay_test1234567890', intentId: 'intent-1' };

  it('403s when the flag is off (never fetches Moyasar)', async () => {
    const svc = makeService(makeDb(), ENV_OFF);
    await expect(svc.verifyTopup('user-1', dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('404s when the intent does not belong to the caller', async () => {
    const db = makeDb({ intentRows: [] });
    const svc = makeService(db, ENV_ON);
    await expect(svc.verifyTopup('user-1', dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('404s when Moyasar does not know the payment', async () => {
    mockFetch.mockRejectedValue(new MoyasarHttpError(404, 'not found'));
    const svc = makeService(makeDb(), ENV_ON);
    await expect(svc.verifyTopup('user-1', dto)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('409 payment_not_paid when status is initiated — no credit', async () => {
    mockFetch.mockResolvedValue({ ...PAID_PAYMENT, status: 'initiated' });
    const svc = makeService(makeDb(), ENV_ON);
    await expect(svc.verifyTopup('user-1', dto)).rejects.toThrow(ConflictException);
  });
  it('409 amount_mismatch when the paid amount differs from the intent — no credit', async () => {
    mockFetch.mockResolvedValue({ ...PAID_PAYMENT, amount: 9999 });
    const svc = makeService(makeDb(), ENV_ON);
    await expect(svc.verifyTopup('user-1', dto)).rejects.toThrow(/amount_mismatch/);
  });
  it('409 currency_mismatch when the currency is not SAR', async () => {
    mockFetch.mockResolvedValue({ ...PAID_PAYMENT, currency: 'USD' });
    const svc = makeService(makeDb(), ENV_ON);
    await expect(svc.verifyTopup('user-1', dto)).rejects.toThrow(/currency_mismatch/);
  });
  it('409 payment_intent_mismatch when the payment is bound to a DIFFERENT intent (PR-Agent r1)', async () => {
    mockFetch.mockResolvedValue({ ...PAID_PAYMENT, description: 'wallet-topup:other-intent' });
    const svc = makeService(makeDb(), ENV_ON);
    await expect(svc.verifyTopup('user-1', dto)).rejects.toThrow(/payment_intent_mismatch/);
  });
  it('credits in one tx on a matching paid payment and flips the intent', async () => {
    mockFetch.mockResolvedValue(PAID_PAYMENT);
    const db = makeDb();
    const svc = makeService(db, ENV_ON);
    const res = await svc.verifyTopup('user-1', dto);
    expect(res.credited).toBe(true);
    expect(res.alreadyCredited).toBe(false);
    expect(res.balance).toBe('150.00');
    expect(res.amountSar).toBe(50);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
  it('replays alreadyCredited (no double credit) for a repeated verify', async () => {
    mockFetch.mockResolvedValue(PAID_PAYMENT);
    const db = makeDb({ txRows: [{ amount: '50.00', user_id: 'user-1', idempotency_key: 'topup:pay_test1234567890' }] });
    const svc = makeService(db, ENV_ON);
    const res = await svc.verifyTopup('user-1', dto);
    expect(res.alreadyCredited).toBe(true);
    expect(res.credited).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe('verifyTopup — P2-282 one intent, one payment', () => {
  const CREDITED_INTENT = { ...INTENT_ROW, status: 'credited', payment_id: 'pay_test1234567890' };

  it('409 topup_already_credited for a DIFFERENT paid payment on a credited intent — no ledger row', async () => {
    mockFetch.mockResolvedValue({ ...PAID_PAYMENT, id: 'pay_second0987654321' });
    const db = makeDb({ intentRows: [CREDITED_INTENT] });
    const svc = makeService(db, ENV_ON);
    const err = await svc.verifyTopup('user-1', { paymentId: 'pay_second0987654321', intentId: 'intent-1' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).message).toBe(
      'topup_already_credited: this top-up was already completed with a different payment — no money was credited',
    );
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.committedLedgerInserts).toHaveLength(0);
  });

  it('replays alreadyCredited for the SAME payment on a credited intent (no re-credit)', async () => {
    mockFetch.mockResolvedValue(PAID_PAYMENT);
    const db = makeDb({
      intentRows: [CREDITED_INTENT],
      txRows: [{ amount: '50.00', user_id: 'user-1', idempotency_key: 'topup:pay_test1234567890' }],
    });
    const svc = makeService(db, ENV_ON);
    const res = await svc.verifyTopup('user-1', { paymentId: 'pay_test1234567890', intentId: 'intent-1' });
    expect(res).toEqual({
      credited: false,
      alreadyCredited: true,
      balance: '150.00',
      paymentId: 'pay_test1234567890',
      amountSar: 50,
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rolls back and 409s topup_intent_race when the in-tx intent flip matches zero rows', async () => {
    mockFetch.mockResolvedValue(PAID_PAYMENT);
    const db = makeDb({ txUpdateIntentReturning: [] });
    const svc = makeService(db, ENV_ON);
    const err = await svc.verifyTopup('user-1', { paymentId: 'pay_test1234567890', intentId: 'intent-1' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).message).toBe(
      'topup_intent_race: intent state changed during verify — transaction rolled back',
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.committedLedgerInserts).toHaveLength(0);
  });
});
