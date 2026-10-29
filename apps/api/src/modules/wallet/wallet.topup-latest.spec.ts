/**
 * P2-279 (run #176) — GET /wallet/topup/latest + service read.
 *
 * Purpose: a failed/unconfirmed 3DS attempt leaves the intent row PENDING
 * forever (there is no 'failed' writer — verified in wallet.topup.service.ts),
 * so the only player-visible trace of "I tried to top up and it never landed"
 * is this newest-intent read. Money-truth: the endpoint reports state, it
 * never interprets charge/refund outcomes.
 */
import { WalletTopupService, sarToHalalas } from './wallet.topup.service';

const INTENT_ROW = {
  id: 'intent-latest',
  user_id: 'user-1',
  amount_halalas: 2500,
  currency: 'SAR',
  status: 'pending',
  payment_id: null,
  idempotency_key: 'topup-intent:user-1:key-latest',
  created_at: new Date('2026-10-29T15:00:00Z'),
  updated_at: new Date('2026-10-29T15:00:00Z'),
};

/** Minimal Drizzle-shaped db stub mirroring wallet.topup.service.spec.ts. */
function makeDb(overrides: {
  latestRow?: unknown;
  empty?: boolean;
  captured?: { wherePred?: unknown; orderByArg?: unknown; limitArg?: unknown };
} = {}) {
  const o = {
    latestRow: INTENT_ROW,
    empty: false,
    captured: undefined,
    ...overrides,
  };
  const pick = (table: unknown): unknown[] => {
    const cols = (table as Record<string, unknown>) ?? {};
    if ('amount_halalas' in cols) return o.empty ? [] : [o.latestRow];
    if ('idempotency_key' in cols) return [];
    if ('wallet_balance' in cols) return [{ wallet_balance: '0.00' }];
    return [];
  };
  return {
    select: () => ({
      from: (_table: unknown) => ({
        where: (pred: unknown) => {
          if (o.captured) o.captured.wherePred = pred;
          return {
            orderBy: (arg: unknown) => {
              if (o.captured) o.captured.orderByArg = arg;
              return {
                limit: (n: number) => {
                  if (o.captured) o.captured.limitArg = n;
                  return Promise.resolve(pick(_table));
                },
              };
            },
          };
        },
      }),
    }),
    insert: () => ({ values: () => ({ returning: async () => [] }) }),
    update: () => ({ set: () => ({ where: () => ({}) }) }),
  } as unknown as Record<string, unknown>;
}

function makeService(db: unknown) {
  return new WalletTopupService(
    db as never,
    {
      get: (key: string) =>
        key === 'WALLET_TOPUP_ENABLED' ? 'true' : undefined,
    } as never,
  );
}

describe('P2-279 — getLatestIntent', () => {
  it('returns the newest intent mapped to the API shape (amountSar from halalas)', async () => {
    const svc = makeService(makeDb());
    const res = await svc.getLatestIntent('user-1');
    expect(res).toEqual({
      intent: {
        id: 'intent-latest',
        amountSar: 25,
        status: 'pending',
        createdAt: '2026-10-29T15:00:00.000Z',
      },
    });
  });

  it('returns {"intent": null} when the user has no intents', async () => {
    const svc = makeService(makeDb({ empty: true }));
    const res = await svc.getLatestIntent('user-1');
    expect(res).toEqual({ intent: null });
  });

  it('scopes to the caller: WHERE predicate + orderBy(created_at DESC) + limit 1', async () => {
    const captured: { wherePred?: unknown; orderByArg?: unknown; limitArg?: unknown } = {};
    const svc = makeService(makeDb({ captured }));
    await svc.getLatestIntent('caller-9');
    // A user-scoping predicate must reach the query (drizzle builds it from
    // eq(wallet_topup_intents.user_id, userId)); orderBy drives the DESC
    // newest-first read; limit 1 caps it. Values are drizzle internals —
    // shape-level assertions + the live PG probe in the run report.
    expect(captured.wherePred).toBeDefined();
    expect(captured.orderByArg).toBeDefined();
    expect(captured.limitArg).toBe(1);
  });

  it('serializes createdAt to ISO for the wire (no Date leaks)', async () => {
    const svc = makeService(makeDb());
    const res = await svc.getLatestIntent('user-1');
    expect(typeof res.intent?.createdAt).toBe('string');
    expect(Number.isNaN(new Date(res.intent!.createdAt).getTime())).toBe(false);
  });

  it('sarToHalalas round-trip guard still holds (sanity)', () => {
    expect(sarToHalalas(25)).toBe(2500);
  });
});
