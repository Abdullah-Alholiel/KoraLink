import { BadRequestException } from '@nestjs/common';
import { WalletService, isUniqueViolation } from './wallet.service';
import { transactions, users } from '../../database/schema';

/**
 * P2-10 specs: wallet recordTransaction idempotent replay.
 *
 * A retried request (e.g. a payment-gateway webhook redelivery) carrying an
 * already-used idempotency_key must return the ORIGINAL ledger entry
 * (Stripe-style, `replayed: true`) instead of a 409 Conflict / 500. Covers
 * both the sequential pre-check and the concurrent unique-violation race.
 *
 * DB is a stubbed Drizzle chain; `from(table)` identity decides which rows
 * the stub returns, so a wrong-table join in the service fails here.
 */
describe('WalletService recordTransaction — idempotent replay (P2-10)', () => {
  const ENTRY = {
    type: 'CREDIT',
    amount: 25,
    referenceType: 'TOPUP',
    referenceId: 'ref-1',
    idempotencyKey: 'key-1',
  } as const;

  const EXISTING_TX = {
    id: 'tx-1',
    user_id: 'user-1',
    type: 'CREDIT',
    amount: '25.00',
    reference_type: 'TOPUP',
    reference_id: 'ref-1',
    idempotency_key: 'key-1',
    status: 'Completed',
    created_at: new Date('2026-08-28T10:00:00Z'),
  };

  type RowPicker = (table: unknown) => unknown[];

  /** db stub whose select().from(table) resolves rows via `picker`. */
  function makeDb(picker: RowPicker) {
    return {
      select: () => ({
        from: (table: unknown) => ({
          where: (_cond: unknown) => ({
            limit: async () => picker(table),
          }),
        }),
      }),
      transaction: jest.fn(async (fn: (tx: never) => unknown) =>
        fn({} as never),
      ),
    };
  }

  function makeTx(returns: {
    ledgerEntry?: unknown;
    walletBalance?: string;
  }) {
    return {
      insert: () => ({
        values: () => ({
          returning: async () => [returns.ledgerEntry ?? EXISTING_TX],
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [
              { id: 'user-1', wallet_balance: returns.walletBalance ?? '725.00' },
            ],
          }),
        }),
      }),
    };
  }

  it('sequential replay: used key returns original entry, no re-insert', async () => {
    const db = makeDb((table) =>
      table === transactions
        ? [EXISTING_TX]
        : [{ wallet_balance: '700.00' }],
    );
    const svc = new WalletService(db as never);

    const res = await svc.recordTransaction('user-1', { ...ENTRY });

    expect(res).toMatchObject({
      replayed: true,
      ledgerEntry: EXISTING_TX,
      wallet_balance: '700.00',
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('fresh key: inserts, updates balance, no replay flag', async () => {
    const tx = makeTx({ walletBalance: '725.00' });
    const db = makeDb(() => []);
    (db.transaction as jest.Mock).mockImplementation(
      async (fn: (t: unknown) => unknown) => fn(tx),
    );
    const svc = new WalletService(db as never);

    const res = await svc.recordTransaction('user-1', { ...ENTRY });

    expect(res).toEqual({
      ledgerEntry: EXISTING_TX,
      wallet_balance: '725.00',
    });
    expect((res as { replayed?: boolean }).replayed).toBeUndefined();
  });

  it('concurrent race: unique-violation loser replays the winner\u2019s entry', async () => {
    let selectCall = 0;
    const db = makeDb((table) => {
      if (table !== transactions) return [{ wallet_balance: '700.00' }];
      selectCall += 1;
      // 1st findReplay: no rows (both racers passed the pre-check);
      // 2nd findReplay (after the race loss): winner's row is committed.
      return selectCall === 1 ? [] : [EXISTING_TX];
    });
    (db.transaction as jest.Mock).mockImplementation(
      async (_fn: unknown) => {
        throw {
          code: '23505',
          constraint: 'transactions_idempotency_key_unique',
        };
      },
    );
    const svc = new WalletService(db as never);

    const res = await svc.recordTransaction('user-1', { ...ENTRY });

    expect(res).toMatchObject({
      replayed: true,
      ledgerEntry: EXISTING_TX,
      wallet_balance: '700.00',
    });
    expect(selectCall).toBe(2);
  });

  it('other unique violations are not swallowed as replays', async () => {
    const db = makeDb(() => []);
    (db.transaction as jest.Mock).mockImplementation(async () => {
      throw { code: '23505', constraint: 'some_other_constraint' };
    });
    const svc = new WalletService(db as never);

    await expect(svc.recordTransaction('user-1', { ...ENTRY })).rejects.toEqual(
      { code: '23505', constraint: 'some_other_constraint' },
    );
  });

  it('insufficient-balance failure still propagates (BadRequest)', async () => {
    const tx = makeTx({ walletBalance: '-5.00' });
    const db = makeDb(() => []);
    (db.transaction as jest.Mock).mockImplementation(
      async (fn: (t: unknown) => unknown) => fn(tx),
    );
    const svc = new WalletService(db as never);

    await expect(svc.recordTransaction('user-1', { ...ENTRY })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('isUniqueViolation', () => {
  it('matches SQLSTATE 23505 with the expected constraint', () => {
    expect(
      isUniqueViolation(
        { code: '23505', constraint: 'transactions_idempotency_key_unique' },
        'transactions_idempotency_key_unique',
      ),
    ).toBe(true);
  });

  it('rejects wrong code, wrong constraint, and non-objects', () => {
    expect(
      isUniqueViolation(
        { code: '42P01', constraint: 'transactions_idempotency_key_unique' },
        'transactions_idempotency_key_unique',
      ),
    ).toBe(false);
    expect(
      isUniqueViolation({ code: '23505', constraint: 'other' }, 'transactions_idempotency_key_unique'),
    ).toBe(false);
    expect(isUniqueViolation(null, 'x')).toBe(false);
    expect(isUniqueViolation('23505', 'x')).toBe(false);
  });
});

// users import retained for the stub's table-identity assertions in future specs.
void users;
