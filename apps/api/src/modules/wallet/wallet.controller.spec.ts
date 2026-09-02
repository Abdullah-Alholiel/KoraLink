import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

/**
 * P0-7 (run #26) — wallet topup feature flag, replacing the old
 * `NODE_ENV === 'production'` string gate. The new gate is
 * `WALLET_TOPUP_ENABLED === 'true'` (default DISABLED).
 */
describe('WalletController — topup feature flag (P0-7, run #26)', () => {
  const makeController = async (flagValue: string | undefined) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        {
          provide: WalletService,
          useValue: {
            recordTransaction: jest.fn().mockResolvedValue({
              ledgerEntry: { id: 'x', type: 'CREDIT', amount: '25.00' },
              wallet_balance: '725.00',
            }),
          },
        },
        {
          provide: ConfigService,
          // New gate: only the literal 'true' enables the endpoint.
          useValue: {
            get: jest.fn((key: string) =>
              key === 'WALLET_TOPUP_ENABLED' ? flagValue : undefined,
            ),
          },
        },
      ],
    }).compile();

    return moduleRef.get<WalletController>(WalletController);
  };

  const dto = { amount: 25, idempotencyKey: 'test-key' } as any;
  const user = { sub: 'user-1' } as any;

  it('WALLET_TOPUP_ENABLED=true: dummy top-up credits the wallet (unchanged behavior)', async () => {
    const ctrl = await makeController('true');
    const res = await ctrl.topup(user, dto);
    expect(res).toMatchObject({ wallet_balance: '725.00' });
  });

  it('WALLET_TOPUP_ENABLED=false: top-up is forbidden (403)', async () => {
    const ctrl = await makeController('false');
    await expect(ctrl.topup(user, dto)).rejects.toThrow(ForbiddenException);
  });

  it('WALLET_TOPUP_ENABLED unset: top-up is forbidden (default DISABLED — migration from NODE_ENV)', async () => {
    const ctrl = await makeController(undefined);
    await expect(ctrl.topup(user, dto)).rejects.toThrow(ForbiddenException);
  });

  it('WALLET_TOPUP_ENABLED="production" (legacy value): still forbidden (proves the NODE_ENV migration)', async () => {
    // Previously, NODE_ENV=production was the "off" state. Under the new gate,
    // "production" must NOT enable the endpoint — operators must set the
    // explicit true flag.
    const ctrl = await makeController('production');
    await expect(ctrl.topup(user, dto)).rejects.toThrow(ForbiddenException);
  });
});
