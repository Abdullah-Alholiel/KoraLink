import { BadRequestException } from '@nestjs/common';
import { WalletService, isUniqueViolation } from './wallet.service';
import { PgDialect } from 'drizzle-orm/pg-core';
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

/**
 * P2-119 specs: getHistory optional ISO date range. The range bounds are
 * ANDed onto the user_id predicate (never replacing it) and the count query
 * shares the same predicate so total/hasMore stay truthful.
 */
describe('WalletService getHistory — date range (P2-119)', () => {
  const dialect = new PgDialect();

  /** db stub recording every where() predicate as rendered SQL + params. */
  function makeHistoryDb(rows: unknown[] = [], total = 0) {
    const wheres: { sql: string; params: unknown[] }[] = [];
    const record = (cond: unknown) => {
      const q = dialect.sqlToQuery(cond as never);
      wheres.push({ sql: q.sql, params: q.params });
    };
    const db = {
      select: (fields?: unknown) => ({
        from: (_table: unknown) => ({
          where: (cond: unknown) => {
            record(cond);
            if (fields) return Promise.resolve([{ total }]);
            return {
              orderBy: () => ({
                offset: () => ({
                  limit: async () => rows,
                }),
              }),
            };
          },
        }),
      }),
    };
    return { db, wheres };
  }

  const FROM = '2026-09-01T00:00:00.000Z';
  const TO = '2026-09-30T23:59:59.999Z';

  it('no range: only the user_id predicate is applied', async () => {
    const { db, wheres } = makeHistoryDb();
    const svc = new WalletService(db as never);
    await svc.getHistory('user-1');
    expect(wheres).toHaveLength(2);
    for (const w of wheres) {
      expect(w.sql).toContain('"user_id" = $1');
      expect(w.sql).not.toContain('>=');
      expect(w.sql).not.toContain('<=');
      expect(w.params).toEqual(['user-1']);
    }
  });

  it('from-only: adds created_at >= from to both queries', async () => {
    const { db, wheres } = makeHistoryDb();
    const svc = new WalletService(db as never);
    await svc.getHistory('user-1', 1, 20, FROM);
    expect(wheres).toHaveLength(2);
    for (const w of wheres) {
      expect(w.sql).toContain('"created_at" >=');
      expect(w.sql).not.toContain('<=');
      expect(w.params).toContain('user-1');
      expect(w.params).toContainEqual(expect.stringContaining('2026-09-01'));
    }
  });

  it('to-only: adds created_at <= to to both queries', async () => {
    const { db, wheres } = makeHistoryDb();
    const svc = new WalletService(db as never);
    await svc.getHistory('user-1', 1, 20, undefined, TO);
    for (const w of wheres) {
      expect(w.sql).toContain('"created_at" <=');
      expect(w.sql).not.toContain('>=');
      expect(w.params).toContain('user-1');
      expect(w.params).toContainEqual(expect.stringContaining('2026-09-30'));
    }
  });

  it('both ordered: applies both bounds and reports filtered total/hasMore', async () => {
    const row = { id: 'tx-1', user_id: 'user-1' };
    const { db, wheres } = makeHistoryDb([row], 25);
    const svc = new WalletService(db as never);
    const res = await svc.getHistory('user-1', 1, 20, FROM, TO);
    expect(res).toEqual({ transactions: [row], total: 25, hasMore: true });
    for (const w of wheres) {
      expect(w.sql).toContain('"created_at" >=');
      expect(w.sql).toContain('"created_at" <=');
    }
  });

  it('both inverted: throws BadRequestException without querying', async () => {
    const { db, wheres } = makeHistoryDb();
    const svc = new WalletService(db as never);
    await expect(svc.getHistory('user-1', 1, 20, TO, FROM)).rejects.toThrow(
      BadRequestException,
    );
    expect(wheres).toHaveLength(0);
  });

  it('predicate additivity: user_id is still ANDed when a range is present', async () => {
    const { db, wheres } = makeHistoryDb();
    const svc = new WalletService(db as never);
    await svc.getHistory('user-1', 2, 10, FROM, TO);
    expect(wheres).toHaveLength(2);
    for (const w of wheres) {
      expect(w.sql).toMatch(/"user_id" = \$1 and .*"created_at" >= .* and .*"created_at" <= /);
      expect(w.params[0]).toBe('user-1');
      expect(w.sql).not.toMatch(/\bor\b/);
    }
    // list and count share the identical predicate
    expect(wheres[0]).toEqual(wheres[1]);
  });
});

// users import retained for the stub's table-identity assertions in future specs.
void users;
