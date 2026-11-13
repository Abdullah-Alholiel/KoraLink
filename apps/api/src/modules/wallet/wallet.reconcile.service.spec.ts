import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { WalletReconcileService } from './wallet.reconcile.service';
import {
  listMoyasarPayments,
  type MoyasarPayment,
} from '../../common/moyasar/moyasar.client';
import type { WalletTopupService } from './wallet.topup.service';

/**
 * Run #189 — top-up reconcile sweep specs (P1 backstop).
 *
 * The sweep must ONLY discover + delegate: every credit decision stays inside
 * the real `verifyTopup` (its 55-spec contract in wallet.topup.service.spec.ts
 * is the money guard). These specs pin: flag/key gating, re-entrancy guard,
 * description→intent discovery, paid-only selection, ConflictException
 * swallow (3DS in flight), error counting + Sentry capture.
 */

jest.mock('../../common/moyasar/moyasar.client', () => ({
  ...jest.requireActual('../../common/moyasar/moyasar.client'),
  listMoyasarPayments: jest.fn(),
}));
jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

import * as Sentry from '@sentry/node';
const mockList = listMoyasarPayments as jest.Mock;
const mockCapture = Sentry.captureException as jest.Mock;
const mockCaptureMessage = Sentry.captureMessage as jest.Mock;

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.now();
const PENDING_ROWS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'user-1',
    created_at: new Date(NOW - 2 * 60 * 1000), // fresh
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: 'user-2',
    created_at: new Date(NOW - 3 * 60 * 1000), // fresh
  },
];

function payment(partial: Partial<MoyasarPayment>): MoyasarPayment {
  return {
    id: 'pay_test1234567890',
    status: 'paid',
    amount: 5000,
    currency: 'SAR',
    description: 'wallet-topup:11111111-1111-4111-8111-111111111111',
    source: { type: 'creditcard', company: 'mada', message: null },
    ...partial,
  };
}

function makeDb(opts: {
  pendingRows?: unknown[];
  /** Rows resolved by the expiry pass's credited-since-cutoff probe. */
  creditedRows?: { id: string }[];
  /** Rows returned by the expiry UPDATE (empty = nothing matched). */
  expiredReturning?: { id: string }[];
  captured?: { updateSet?: unknown; catchPred?: unknown };
} = {}): unknown {
  const o = {
    pendingRows: opts.pendingRows ?? PENDING_ROWS,
    creditedRows: opts.creditedRows ?? [],
    expiredReturning: opts.expiredReturning ?? [],
    captured: opts.captured,
  };
  const isIntents = (table: unknown) => {
    const cols = (table as Record<string, unknown>) ?? {};
    return 'status' in cols && 'idempotency_key' in cols;
  };
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          // The pending scan chains orderBy().limit() and must resolve the
          // pending rows; the expiry credited-probe awaits the where-chain
          // directly (drizzle builders are thenable). One object serves both.
          const scan = { limit: () => Promise.resolve(isIntents(table) ? o.pendingRows : []) };
          return Object.assign(Promise.resolve(isIntents(table) ? o.creditedRows : []), {
            orderBy: () => scan,
          });
        },
      }),
    }),
    update: () => ({
      set: (v: unknown) => ({
        where: (pred: unknown) => {
          if (o.captured) {
            o.captured.updateSet = v;
            o.captured.catchPred = pred;
          }
          // Drizzle shape: where() chains into returning() (the sweep's expiry
          // UPDATE reads back the ids it flipped).
          return {
            returning: async () => o.expiredReturning,
          };
        },
      }),
    }),
  };
}

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

function makeService(opts: {
  enabled?: boolean;
  hasKey?: boolean;
  pendingRows?: unknown[];
  db?: unknown;
  verify?: (userId: string, dto: { intentId: string; paymentId: string }) => Promise<unknown>;
}) {
  const verify = opts.verify ?? jest.fn().mockResolvedValue({ credited: true, paymentId: 'pay_x', amountSar: 50 });
  const topupService = { verifyTopup: verify } as unknown as WalletTopupService;
  const config = makeConfig({
    WALLET_TOPUP_ENABLED: opts.enabled === false ? 'false' : 'true',
    MOYASAR_SECRET_KEY: opts.hasKey === false ? undefined : 'sk_test_x',
  });
  const service = new WalletReconcileService(
    (opts.db ?? makeDb({ pendingRows: opts.pendingRows })) as never,
    config,
    topupService,
  );
  return { service, verify };
}

beforeEach(() => {
  mockList.mockReset();
  mockCapture.mockReset();
  mockCaptureMessage.mockReset();
});

describe('WalletReconcileService — gating', () => {
  it('no-ops without touching Moyasar or the DB when the topup flag is off', async () => {
    const { service, verify } = makeService({ enabled: false });
    const out = await service.reconcileOnce();
    expect(out).toEqual({ scanned: 0, credited: 0, skipped: 0, failed: 0, agedOut: 0, expired: 0 });
    expect(mockList).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('no-ops when no Moyasar secret key is configured', async () => {
    const { service, verify } = makeService({ hasKey: false });
    const out = await service.reconcileOnce();
    expect(out.scanned).toBe(0);
    expect(mockList).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('second concurrent pass is a no-op while the first is running', async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => (releaseFirst = r));
    const { service, verify } = makeService({
      verify: jest.fn().mockImplementation(() => gate.then(() => ({ credited: true }))),
    });
    mockList.mockResolvedValue([payment({})]);
    const first = service.reconcileOnce();
    const second = await service.reconcileOnce();
    expect(second.credited).toBe(0);
    releaseFirst();
    const out = await first;
    expect(out.credited).toBe(1);
    expect(verify).toHaveBeenCalledTimes(1);
  });
});

describe('WalletReconcileService — discovery', () => {
  it('credits a pending intent whose payment is paid + bound + uncredited', async () => {
    const { service, verify } = makeService({});
    mockList.mockResolvedValue([
      payment({ description: 'wallet-topup:11111111-1111-4111-8111-111111111111' }),
    ]);
    const out = await service.reconcileOnce();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith('user-1', {
      intentId: '11111111-1111-4111-8111-111111111111',
      paymentId: 'pay_test1234567890',
    });
    expect(out).toEqual({ scanned: 2, credited: 1, skipped: 1, failed: 0, agedOut: 0, expired: 0 });
  });

  it('prefers the PAID payment when an intent carries several (stale 3DS then paid retry)', async () => {
    const { service, verify } = makeService({ pendingRows: [PENDING_ROWS[0]] });
    mockList.mockResolvedValue([
      payment({ id: 'pay_stale999999999', status: 'failed' }),
      payment({ id: 'pay_paid00000000001', status: 'paid' }),
    ]);
    const out = await service.reconcileOnce();
    expect(verify).toHaveBeenCalledWith('user-1', {
      intentId: '11111111-1111-4111-8111-111111111111',
      paymentId: 'pay_paid00000000001',
    });
    expect(out.credited).toBe(1);
  });

  it('keeps an already-found paid payment even when a later non-paid one shares the intent', async () => {
    const { service, verify } = makeService({ pendingRows: [PENDING_ROWS[0]] });
    mockList.mockResolvedValue([
      payment({ id: 'pay_paid00000000001', status: 'paid' }),
      payment({ id: 'pay_stale999999999', status: 'failed' }),
    ]);
    const out = await service.reconcileOnce();
    expect(verify).toHaveBeenCalledWith('user-1', {
      intentId: '11111111-1111-4111-8111-111111111111',
      paymentId: 'pay_paid00000000001',
    });
    expect(out.credited).toBe(1);
  });

  it('skips payments whose description does not carry the intent-binding prefix', async () => {
    const { service, verify } = makeService({});
    mockList.mockResolvedValue([
      payment({ description: 'unrelated-checkout:whatever' }),
    ]);
    const out = await service.reconcileOnce();
    expect(verify).not.toHaveBeenCalled();
    expect(out).toEqual({ scanned: 2, credited: 0, skipped: 2, failed: 0, agedOut: 0, expired: 0 });
  });

  it('never delegates a payment that is not paid (3DS pending/failed/authorized)', async () => {
    const { service, verify } = makeService({});
    mockList.mockResolvedValue([
      payment({ status: 'failed' }),
      payment({ status: 'pending' }),
    ]);
    const out = await service.reconcileOnce();
    expect(verify).not.toHaveBeenCalled();
    expect(out.credited).toBe(0);
    expect(out.failed).toBe(0);
  });

  it('skips zero pending intents without listing payments', async () => {
    const { service, verify } = makeService({ pendingRows: [] });
    const out = await service.reconcileOnce();
    expect(mockList).not.toHaveBeenCalled();
    expect(out).toEqual({ scanned: 0, credited: 0, skipped: 0, failed: 0, agedOut: 0, expired: 0 });
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('WalletReconcileService — delegation outcomes', () => {
  it('counts a verifyTopup replay (alreadyCredited) as skipped, never credited', async () => {
    const { service, verify } = makeService({
      pendingRows: [PENDING_ROWS[0]],
      verify: jest.fn().mockResolvedValue({ credited: false, alreadyCredited: true }),
    });
    mockList.mockResolvedValue([payment({})]);
    const out = await service.reconcileOnce();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(out.credited).toBe(0);
    expect(out.skipped).toBe(1);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('swallows ConflictException (payment_not_paid = 3DS in flight) as a skip', async () => {
    const { service } = makeService({
      pendingRows: [PENDING_ROWS[0]],
      verify: jest.fn().mockRejectedValue(new ConflictException('payment_not_paid: x')),
    });
    mockList.mockResolvedValue([payment({})]);
    const out = await service.reconcileOnce();
    expect(out.skipped).toBe(1);
    expect(out.failed).toBe(0);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('counts unexpected verify failures + captures them in Sentry, never throws', async () => {
    const { service } = makeService({
      verify: jest.fn().mockRejectedValue(new Error('db down')),
    });
    mockList.mockResolvedValue([payment({})]);
    const out = await service.reconcileOnce();
    expect(out.failed).toBe(1);
    expect(out.credited).toBe(0);
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('surfaces anomalous conflicts (binding/amount mismatch) as failures with Sentry, only payment_not_paid stays silent', async () => {
    const { service } = makeService({
      pendingRows: [PENDING_ROWS[0]],
      verify: jest.fn().mockRejectedValue(
        new ConflictException('payment_intent_mismatch: not created for this intent'),
      ),
    });
    mockList.mockResolvedValue([payment({})]);
    const out = await service.reconcileOnce();
    expect(out.failed).toBe(1);
    expect(out.skipped).toBe(0);
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('a Moyasar list failure propagates to the cron wrapper (next tick retries)', async () => {
    const { service, verify } = makeService({});
    mockList.mockRejectedValue(new Error('moyasar 503'));
    await expect(service.reconcileOnce()).rejects.toThrow('moyasar 503');
    expect(verify).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe('WalletReconcileService — P2-314 age-out visibility', () => {
  function agedRow(overByMs: number, id: string) {
    return {
      id,
      user_id: 'user-3',
      created_at: new Date(NOW - (HOUR_MS + overByMs)),
    };
  }

  it('alerts exactly once (warn + Sentry message) for a pending intent past 1h, regardless of Moyasar visibility', async () => {
    const { service, verify } = makeService({
      pendingRows: [
        PENDING_ROWS[0],
        agedRow(5 * 60 * 1000, '33333333-3333-4333-8333-333333333333'),
      ],
    });
    // Moyasar list does NOT contain the aged intent — the alert must still fire.
    mockList.mockResolvedValue([
      payment({ description: 'wallet-topup:11111111-1111-4111-8111-111111111111' }),
    ]);
    const out = await service.reconcileOnce();
    expect(out.agedOut).toBe(1);
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Wallet top-up intent aged out of rescuable window',
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ intentId: '33333333-3333-4333-8333-333333333333' }),
      }),
    );
    // Alerting must NOT invent a credit path — verify only for the paid hit.
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith('user-1', expect.anything());
    expect(out.credited).toBe(1);
  });

  it('never re-alerts the same intent on subsequent sweeps', async () => {
    const aged = agedRow(10 * 60 * 1000, '33333333-3333-4333-8333-333333333333');
    const { service } = makeService({ pendingRows: [aged] });
    mockList.mockResolvedValue([]);
    await service.reconcileOnce();
    await service.reconcileOnce();
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
  });

  it('evicts resolved intents from the dedup Set — a resurfaced pending intent re-alerts (PR-Agent r1 run #198)', async () => {
    // Mutable db stub: rows change between sweeps to simulate an intent that
    // resolves (leaves the pending scan) and later resurfaces. t_b8468d98:
    // makeDb serves BOTH chains (pending scan + expiry probes) from the same
    // array, so the mutation is visible to every chain each tick.
    const rows: unknown[] = [agedRow(10 * 60 * 1000, '33333333-3333-4333-8333-333333333333')];
    const mutableDb = makeDb({ pendingRows: rows });
    const config = makeConfig({ WALLET_TOPUP_ENABLED: 'true', MOYASAR_SECRET_KEY: 'sk_test_x' });
    const topupService = { verifyTopup: jest.fn() } as unknown as WalletTopupService;
    const service = new WalletReconcileService(mutableDb as never, config, topupService);

    mockList.mockResolvedValue([]);
    await service.reconcileOnce(); // tick 1: alerts once
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);

    rows.length = 0; // intent resolves (credited/cancelled) → leaves pending scan
    await service.reconcileOnce(); // tick 2: eviction sweep, no alert
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);

    // Same id resurfaces as pending: WITHOUT eviction tick 3 would stay silent;
    // re-alerting is the DOCUMENTED trade-off (ops must know it resurfaced).
    rows.push(agedRow(10 * 60 * 1000, '33333333-3333-4333-8333-333333333333'));
    await service.reconcileOnce(); // tick 3: re-alerts
    expect(mockCaptureMessage).toHaveBeenCalledTimes(2);
  });

  it('fresh intents never alert (agedOut stays 0)', async () => {
    const { service } = makeService({ pendingRows: PENDING_ROWS });
    mockList.mockResolvedValue([]);
    const out = await service.reconcileOnce();
    expect(out.agedOut).toBe(0);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('counts multiple aged intents in one sweep but alerts each once', async () => {
    const { service } = makeService({
      pendingRows: [
        agedRow(1 * 60 * 1000, '33333333-3333-4333-8333-333333333333'),
        agedRow(2 * 60 * 1000, '55555555-5555-4555-8555-555555555555'),
      ],
    });
    mockList.mockResolvedValue([]);
    const out = await service.reconcileOnce();
    expect(out.agedOut).toBe(2);
    expect(mockCaptureMessage).toHaveBeenCalledTimes(2);
  });

  it('a null/invalid created_at never crashes the sweep nor alerts', async () => {
    const { service } = makeService({
      pendingRows: [{ id: '44444444-4444-4444-8444-444444444444', user_id: 'user-4', created_at: null }],
    });
    mockList.mockResolvedValue([]);
    const out = await service.reconcileOnce();
    expect(out.agedOut).toBe(0);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
    expect(out.scanned).toBe(1);
  });

  it('disables the whole sweep with the topup flag (age-out alerts included)', async () => {
    const { service } = makeService({ enabled: false, pendingRows: [agedRow(60 * 60 * 1000, '33333333-3333-4333-8333-333333333333')] });
    const out = await service.reconcileOnce();
    expect(out).toEqual({ scanned: 0, credited: 0, skipped: 0, failed: 0, agedOut: 0, expired: 0 });
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});

describe('WalletReconcileService — cron wrapper', () => {
  it('tick returns early when the flag is off (no reconcile pass at all)', async () => {
    const { service, verify } = makeService({ enabled: false });
    await service.handleReconcileTick();
    expect(mockList).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('tick captures a reconcile-pass crash in Sentry and never throws', async () => {
    const { service } = makeService({});
    mockList.mockRejectedValue(new Error('moyasar 503'));
    await expect(service.handleReconcileTick()).resolves.toBeUndefined();
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });
});

describe('WalletReconcileService — abandoned-intent expiry (t_b8468d98)', () => {
  // Aged well past the default 24h expiry window.
  const ABANDONED_ID = '77777777-7777-4777-8777-777777777777';
  const abandonedRow = {
    id: ABANDONED_ID,
    user_id: 'user-7',
    created_at: new Date(NOW - 25 * HOUR_MS),
  };

  function makeExpiryDb(opts: {
    pendingRows?: unknown[];
    expiredReturning?: { id: string }[];
    captured?: { updateSet?: unknown; catchPred?: unknown };
  } = {}) {
    const captured = opts.captured ?? {};
    const db = makeDb({
      pendingRows: opts.pendingRows ?? [abandonedRow],
      expiredReturning: opts.expiredReturning ?? [{ id: ABANDONED_ID }],
      captured,
    });
    return { db, captured };
  }

  it('expires a pending intent older than the window with no paid payment bound', async () => {
    const { db, captured } = makeExpiryDb();
    mockList.mockResolvedValue([]); // discovery finds nothing for the intent
    const { service } = makeService({ db });
    const out = await service.reconcileOnce();
    expect(out.expired).toBe(1);
    expect(out.agedOut).toBe(1); // the same intent is >1h, age-out alert fires too
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Wallet top-up intents expired (abandoned)',
      expect.objectContaining({ level: 'warning', extra: expect.objectContaining({ count: 1, expiryHours: 24 }) }),
    );
    // Money-truth invariants reach the DB (render-level, wallet.topup-latest
    // pattern): pending-only status guard + age cutoff; the empty exclusion
    // sets collapse to neutral `true` (verified drizzle behavior, probe).
    const dialect = new PgDialect();
    const { sql, params } = dialect.sqlToQuery(captured.catchPred as SQL);
    expect(sql).toContain('"wallet_topup_intents"."status"');
    expect(params).toContain('pending');
    expect(sql).toContain('"wallet_topup_intents"."created_at" <');
    expect(sql).not.toContain('not in'); // nothing paid is bound → no exclusions
    expect(params).not.toContain(ABANDONED_ID);
    expect(captured.updateSet).toEqual({ status: 'failed', updated_at: expect.any(Date) });
  });

  it('never expires an intent whose discovery found a PAID payment (credit first)', async () => {
    // expiredReturning [] models the real DB: the paid-bound exclusion removes
    // the row from the UPDATE. The render check below proves the exclusion is
    // actually in the predicate.
    const { db, captured } = makeExpiryDb({ expiredReturning: [] });
    mockList.mockResolvedValue([
      payment({ description: `wallet-topup:${ABANDONED_ID}` }),
    ]);
    const { service } = makeService({
      db,
      verify: jest.fn().mockResolvedValue({ credited: true, paymentId: 'pay_x', amountSar: 50 }),
    });
    const out = await service.reconcileOnce();
    expect(out.credited).toBe(1);
    expect(out.expired).toBe(0); // paid-hit intents are excluded from the UPDATE
    const { params } = new PgDialect().sqlToQuery(captured.catchPred as SQL);
    expect(params).toContain(ABANDONED_ID); // bound as a not-in exclusion value
  });

  it('leaves a sweep-eligible intent pending when its paid verify FAILED this pass (retry next tick)', async () => {
    const { db, captured } = makeExpiryDb({ expiredReturning: [] });
    mockList.mockResolvedValue([
      payment({ description: `wallet-topup:${ABANDONED_ID}` }),
    ]);
    const { service } = makeService({
      db,
      verify: jest.fn().mockRejectedValue(new Error('moyasar 503')),
    });
    const out = await service.reconcileOnce();
    expect(out.failed).toBe(1);
    expect(out.expired).toBe(0); // excluded: possibly charged — must retry, not expire
    const { params } = new PgDialect().sqlToQuery(captured.catchPred as SQL);
    expect(params).toContain(ABANDONED_ID); // paid exclusion, not expiry fodder
  });

  it('leaves a fresh (young) pending intent alone', async () => {
    const { db, captured } = makeExpiryDb({ pendingRows: [PENDING_ROWS[0]], expiredReturning: [] });
    mockList.mockResolvedValue([]);
    const { service } = makeService({ db });
    const out = await service.reconcileOnce();
    expect(out.expired).toBe(0);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
    // The age cutoff is a real bound parameter (< cutoff), not a no-op.
    // drizzle's sqlToQuery serializes Date params to ISO strings.
    const { sql, params } = new PgDialect().sqlToQuery(captured.catchPred as SQL);
    expect(sql).toContain('"wallet_topup_intents"."created_at" <');
    expect(params.some((p) => p instanceof Date || (typeof p === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(p)))).toBe(true);
  });

  it('respects the WALLET_TOPUP_INTENT_EXPIRY_HOURS override (integer hours)', async () => {
    const { db, captured } = makeExpiryDb();
    // Stub config read happens inside the service; assert via Sentry payload
    // after configuring the override through makeConfig in a bespoke service.
    const config = makeConfig({
      WALLET_TOPUP_ENABLED: 'true',
      MOYASAR_SECRET_KEY: 'sk_test_x',
      WALLET_TOPUP_INTENT_EXPIRY_HOURS: '6',
    });
    const topupService = { verifyTopup: jest.fn() } as unknown as WalletTopupService;
    const service = new WalletReconcileService(db as never, config, topupService);
    mockList.mockResolvedValue([]);
    const out = await service.reconcileOnce();
    expect(out.expired).toBe(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Wallet top-up intents expired (abandoned)',
      expect.objectContaining({ extra: expect.objectContaining({ expiryHours: 6 }) }),
    );
    void captured;
  });

  it('an expiry UPDATE failure is contained: outcome keeps counters, Sentry captures, no throw', async () => {
    // Selects work (makeDb shape); only the expiry UPDATE explodes.
    const boomDb = {
      ...(makeDb({ pendingRows: [abandonedRow] }) as Record<string, unknown>),
      update: () => ({
        set: () => ({
          where: () => {
            throw new Error('db down');
          },
        }),
      }),
    };
    const { service } = makeService({ db: boomDb });
    mockList.mockResolvedValue([]);
    const out = await service.reconcileOnce();
    expect(out.expired).toBe(0);
    expect(out.agedOut).toBe(1);
    expect(mockCapture).toHaveBeenCalledTimes(1); // expiry failure, not the age-out message path
  });
});
