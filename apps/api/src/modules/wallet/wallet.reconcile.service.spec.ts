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
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

import * as Sentry from '@sentry/node';
const mockList = listMoyasarPayments as jest.Mock;
const mockCapture = Sentry.captureException as jest.Mock;

const PENDING_ROWS = [
  { id: '11111111-1111-4111-8111-111111111111', user_id: 'user-1' },
  { id: '22222222-2222-4222-8222-222222222222', user_id: 'user-2' },
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
});

describe('WalletReconcileService — gating', () => {
  it('no-ops without touching Moyasar or the DB when the topup flag is off', async () => {
    const { service, verify } = makeService({ enabled: false });
    const out = await service.reconcileOnce();
    expect(out).toEqual({ scanned: 0, credited: 0, skipped: 0, failed: 0 });
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
    expect(out).toEqual({ scanned: 2, credited: 1, skipped: 1, failed: 0 });
  });

  it('skips payments whose description does not carry the intent-binding prefix', async () => {
    const { service, verify } = makeService({});
    mockList.mockResolvedValue([
      payment({ description: 'unrelated-checkout:whatever' }),
    ]);
    const out = await service.reconcileOnce();
    expect(verify).not.toHaveBeenCalled();
    expect(out).toEqual({ scanned: 2, credited: 0, skipped: 2, failed: 0 });
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
    expect(out).toEqual({ scanned: 0, credited: 0, skipped: 0, failed: 0 });
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

  it('a Moyasar list failure propagates to the cron wrapper (next tick retries)', async () => {
    const { service, verify } = makeService({});
    mockList.mockRejectedValue(new Error('moyasar 503'));
    await expect(service.reconcileOnce()).rejects.toThrow('moyasar 503');
    expect(verify).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
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
