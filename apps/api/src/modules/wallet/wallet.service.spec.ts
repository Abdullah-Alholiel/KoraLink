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
 * ANDed onto the user_id predicate so total/hasMore stay truthful.
 *
 * P2-241 update: getHistory is now ONE query — COUNT(*) OVER() rides the
 * page select (listForUser is the reference impl) — so the stub records a
 * SINGLE predicate per call, and new specs pin the ORDER BY tiebreaker and
 * the window-function total.
 */
describe('WalletService getHistory — date range (P2-119)', () => {
  const dialect = new PgDialect();

  /**
   * db stub recording the where() predicate + orderBy as rendered SQL.
   * Reviewer A run #154: when the page comes back EMPTY the service now runs
   * a fallback degenerate COUNT — the stub models it as a thenable on the
   * same where() result (drizzle builders are thenable), resolving
   * `{ total: countTotal }`; `countCalls` records how often it fired.
   */
  function makeHistoryDb(rows: unknown[] = [], total = 0, countTotal = 0) {
    const wheres: { sql: string; params: unknown[] }[] = [];
    const orders: string[] = [];
    let countCalls = 0;
    const record = (cond: unknown) => {
      const q = dialect.sqlToQuery(cond as never);
      wheres.push({ sql: q.sql, params: q.params });
    };
    const db = {
      select: () => ({
        from: (_table: unknown) => ({
          where: (cond: unknown) => {
            record(cond);
            return {
              orderBy: (...exprs: unknown[]) => {
                for (const e of exprs) {
                  orders.push(dialect.sqlToQuery(e as never).sql);
                }
                return {
                  offset: () => ({
                    limit: async () =>
                      rows.map((r) => ({ ...(r as object), total })),
                  }),
                };
              },
              // degenerate COUNT path (no orderBy chain): direct thenable
              then: (
                res: (v: Array<{ total: number }>) => void,
              ) => {
                countCalls += 1;
                res([{ total: countTotal }]);
                return Promise.resolve();
              },
            };
          },
        }),
      }),
    };
    return { db, wheres, orders, countCalls: () => countCalls };
  }

  const FROM = '2026-09-01T00:00:00.000Z';
  const TO = '2026-09-30T23:59:59.999Z';

  it('no range: only the user_id predicate is applied (single window-count query)', async () => {
    const { db, wheres } = makeHistoryDb([{ id: 'tx-1' }], 1);
    const svc = new WalletService(db as never);
    await svc.getHistory('user-1');
    expect(wheres).toHaveLength(1); // P2-241: ONE query, not list + COUNT
    expect(wheres[0].sql).toContain('"user_id" = $1');
    expect(wheres[0].sql).not.toContain('>=');
    expect(wheres[0].sql).not.toContain('<=');
    expect(wheres[0].params).toEqual(['user-1']);
  });

  it('from-only: adds created_at >= from', async () => {
    const { db, wheres } = makeHistoryDb([{ id: 'tx-1' }], 1);
    const svc = new WalletService(db as never);
    await svc.getHistory('user-1', 1, 20, FROM);
    expect(wheres).toHaveLength(1);
    expect(wheres[0].sql).toContain('"created_at" >=');
    expect(wheres[0].sql).not.toContain('<=');
    expect(wheres[0].params).toContain('user-1');
    expect(wheres[0].params).toContainEqual(expect.stringContaining('2026-09-01'));
  });

  it('to-only: adds created_at <= to', async () => {
    const { db, wheres } = makeHistoryDb([{ id: 'tx-1' }], 1);
    const svc = new WalletService(db as never);
    await svc.getHistory('user-1', 1, 20, undefined, TO);
    expect(wheres).toHaveLength(1);
    expect(wheres[0].sql).toContain('"created_at" <=');
    expect(wheres[0].sql).not.toContain('>=');
    expect(wheres[0].params).toContain('user-1');
    expect(wheres[0].params).toContainEqual(expect.stringContaining('2026-09-30'));
  });

  it('both ordered: applies both bounds and reports filtered total/hasMore', async () => {
    const row = { id: 'tx-1', user_id: 'user-1' };
    const { db, wheres } = makeHistoryDb([row], 25);
    const svc = new WalletService(db as never);
    const res = await svc.getHistory('user-1', 1, 20, FROM, TO);
    expect(res.total).toBe(25);
    expect(res.hasMore).toBe(true);
    expect(res.transactions[0]).toMatchObject(row);
    expect(wheres[0].sql).toContain('"created_at" >=');
    expect(wheres[0].sql).toContain('"created_at" <=');
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
    const { db, wheres } = makeHistoryDb([{ id: 'tx-1' }], 1);
    const svc = new WalletService(db as never);
    await svc.getHistory('user-1', 2, 10, FROM, TO);
    expect(wheres).toHaveLength(1);
    expect(wheres[0].sql).toMatch(/"user_id" = \$1 and .*"created_at" >= .* and .*"created_at" <= /);
    expect(wheres[0].params[0]).toBe('user-1');
    expect(wheres[0].sql).not.toMatch(/\bor\b/);
  });

  // ── P2-241: pagination determinism + the window-count total ──

  it('orders by created_at DESC with id ASC tiebreaker (P2-241)', async () => {
    const { db, orders } = makeHistoryDb();
    const svc = new WalletService(db as never);
    await svc.getHistory('user-1');
    expect(orders).toEqual([
      '"transactions"."created_at" desc',
      '"transactions"."id" asc',
    ]);
  });

  it('total comes from the window function on the page rows (P2-241)', async () => {
    const rows = [{ id: 'tx-1' }, { id: 'tx-2' }];
    const { db } = makeHistoryDb(rows, 41);
    const svc = new WalletService(db as never);
    const res = await svc.getHistory('user-1', 1, 20);
    expect(res.total).toBe(41);
    expect(res.hasMore).toBe(true);
    expect(res.transactions).toHaveLength(2);
  });

  it('exactly-full last page: hasMore false from the authoritative total (P2-241)', async () => {
    const { db } = makeHistoryDb([{ id: 'tx-1' }], 20);
    const svc = new WalletService(db as never);
    const res = await svc.getHistory('user-1', 1, 20);
    expect(res.total).toBe(20);
    expect(res.hasMore).toBe(false);
  });

  // ── Reviewer A run #154: beyond-end page must not report total 0 ──

  it('beyond-end page: falls back to a degenerate COUNT (total stays truthful)', async () => {
    // Page 99 returns no rows → COUNT(*) OVER() never materializes →
    // the service must run the fallback COUNT against the SAME predicate.
    let countCalls = 0;
    const db = {
      select: (projection?: Record<string, unknown>) => ({
        from: (_table: unknown) => ({
          where: (cond: unknown) => {
            const q = dialect.sqlToQuery(cond as never);
            // The fallback selects only `total` — assert BOTH queries carry
            // the identical user predicate so the fallback counts the same
            // filtered set.
            expect(q.sql).toContain('"user_id" = $1');
            expect(q.params).toEqual(['user-1']);
            return {
              orderBy: (..._exprs: unknown[]) => ({
                offset: () => ({
                  limit: async () => [] as unknown[],
                }),
              }),
              // no orderBy chain (degenerate COUNT) — direct await-able
              ...(projection && 'total' in projection
                ? { then: (res: (v: Array<{ total: number }>) => void) => { countCalls += 1; res([{ total: 37 }]); return Promise.resolve(); } }
                : {}),
            };
          },
        }),
      }),
    };
    const svc = new WalletService(db as never);
    const res = await svc.getHistory('user-1', 99, 20);
    expect(res.transactions).toHaveLength(0);
    expect(res.total).toBe(37); // NOT 0 — the wallet still has 37 transactions
    expect(res.hasMore).toBe(false);
    expect(countCalls).toBe(1);
  });

  it('normal page: NO fallback COUNT runs (window total only, single query)', async () => {
    let countCalls = 0;
    const rows = [{ id: 'tx-1' }];
    const db = {
      select: (projection?: Record<string, unknown>) => ({
        from: (_table: unknown) => ({
          where: (cond: unknown) => {
            const q = dialect.sqlToQuery(cond as never);
            expect(q.sql).toContain('"user_id" = $1');
            return {
              orderBy: () => ({
                offset: () => ({
                  limit: async () => rows.map((r) => ({ ...r, total: 5 })),
                }),
              }),
              ...(projection && 'total' in projection
                ? { then: () => { countCalls += 1; return Promise.resolve(); } }
                : {}),
            };
          },
        }),
      }),
    };
    const svc = new WalletService(db as never);
    const res = await svc.getHistory('user-1', 1, 20);
    expect(res.total).toBe(5);
    expect(countCalls).toBe(0); // fallback never fires on a normal page
  });
});

// users import retained for the stub's table-identity assertions in future specs.
void users;
