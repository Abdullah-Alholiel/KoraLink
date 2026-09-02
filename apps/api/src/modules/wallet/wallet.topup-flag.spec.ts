import { ForbiddenException } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

/**
 * P0-7 (run #26) — wallet topup feature-flag tests.
 *
 * The `/wallet/topup` endpoint is gated by `WALLET_TOPUP_ENABLED === 'true'`
 * (default DISABLED). The previous `NODE_ENV === 'production'` string compare
 * was the run-#25 Strix finding (CVSS 9.1) — free SAR 10,000 credits open on
 * any Tailscale-reachable deployment running NODE_ENV=development. Real
 * payments replace this path when P0-2 ships.
 *
 * The behavior spec exercises the same ConfigService key the real controller
 * reads. Wiring a full HTTP test (with a guard-mocked CurrentUser) is out of
 * scope for a unit spec.
 */
describe('WalletController.topup gate (P0-7 — explicit feature flag, NOT NODE_ENV)', () => {
  function setup(flagValue: string | undefined) {
    const walletService = {
      recordTransaction: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as WalletService;
    const configService = {
      get: jest.fn().mockImplementation((key: string) =>
        key === 'WALLET_TOPUP_ENABLED' ? flagValue : undefined,
      ),
    } as any;
    const controller = new WalletController(walletService, configService);
    return { controller, walletService, configService };
  }

  it('rejects with ForbiddenException when flag is undefined (default DISABLED)', async () => {
    const { controller } = setup(undefined);
    await expect(
      controller.topup(
        { sub: 'u1' } as any,
        {
          amount: 100,
          referenceId: 'r1',
          idempotencyKey: 'k1',
        } as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects when flag is the literal "false"', async () => {
    const { controller } = setup('false');
    await expect(
      controller.topup(
        { sub: 'u1' } as any,
        { amount: 100, referenceId: 'r1', idempotencyKey: 'k1' } as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects when flag is the legacy "production" string (proves the migration from NODE_ENV)', async () => {
    // "production" used to be the "off" state. Under the new gate, it must
    // NOT enable the endpoint — operators must set the explicit flag.
    const { controller } = setup('production');
    await expect(
      controller.topup(
        { sub: 'u1' } as any,
        { amount: 100, referenceId: 'r1', idempotencyKey: 'k1' } as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('proceeds to walletService.recordTransaction when flag is "true"', async () => {
    const { controller, walletService } = setup('true');
    const result = await controller.topup(
      { sub: 'u1' } as any,
      {
        amount: 100,
        referenceId: 'r1',
        idempotencyKey: 'k1',
      } as any,
    );
    expect(walletService.recordTransaction).toHaveBeenCalledWith('u1', {
      type: 'CREDIT',
      amount: 100,
      referenceType: 'TOPUP',
      referenceId: 'r1',
      idempotencyKey: 'k1',
    });
    expect(result).toEqual({ ok: true });
  });

  it('passes through the user sub and dto to the service', async () => {
    const { controller, walletService } = setup('true');
    await controller.topup(
      { sub: 'user-xyz' } as any,
      {
        amount: 50,
        referenceId: 'r2',
        idempotencyKey: 'k2',
      } as any,
    );
    expect(walletService.recordTransaction).toHaveBeenCalledWith(
      'user-xyz',
      expect.objectContaining({ type: 'CREDIT', amount: 50 }),
    );
  });
});
