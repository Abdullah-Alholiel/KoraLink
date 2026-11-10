import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
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

function makeDb(pendingRows: unknown[]): unknown {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve(pendingRows),
          }),
        }),
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
  verify?: (userId: string, dto: { intentId: string; paymentId: string }) => Promise<unknown>;
}) {
  const verify = opts.verify ?? jest.fn().mockResolvedValue({ credited: true, paymentId: 'pay_x', amountSar: 50 });
  const topupService = { verifyTopup: verify } as unknown as WalletTopupService;
  const config = makeConfig({
    WALLET_TOPUP_ENABLED: opts.enabled === false ? 'false' : 'true',
    MOYASAR_SECRET_KEY: opts.hasKey === false ? undefined : 'sk_test_x',
  });
  const service = new WalletReconcileService(
    makeDb(opts.pendingRows ?? PENDING_ROWS) as never,
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
    expect(out).toEqual({ scanned: 0, credited: 0, skipped: 0, failed: 0, agedOut: 0 });
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
    expect(out).toEqual({ scanned: 2, credited: 1, skipped: 1, failed: 0, agedOut: 0 });
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
    expect(out).toEqual({ scanned: 2, credited: 0, skipped: 2, failed: 0, agedOut: 0 });
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
    expect(out).toEqual({ scanned: 0, credited: 0, skipped: 0, failed: 0, agedOut: 0 });
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
    const { service, verify } = makeService({
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
    const { service, verify } = makeService({
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
    expect(out).toEqual({ scanned: 0, credited: 0, skipped: 0, failed: 0, agedOut: 0 });
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
