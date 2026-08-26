import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

describe('WalletController — topup production gate (P0-2 interim)', () => {
  const makeController = async (nodeEnv: string) => {
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
          useValue: { get: jest.fn(() => nodeEnv) },
        },
      ],
    }).compile();

    return moduleRef.get<WalletController>(WalletController);
  };

  const dto = { amount: 25, idempotencyKey: 'test-key' };
  const user = { sub: 'user-1' };

  it('dev environment: dummy top-up credits the wallet (unchanged behavior)', async () => {
    const ctrl = await makeController('development');
    const res = await ctrl.topup(user, dto);
    expect(res).toMatchObject({ wallet_balance: '725.00' });
  });

  it('production environment: top-up is forbidden (403)', async () => {
    const ctrl = await makeController('production');
    await expect(ctrl.topup(user, dto)).rejects.toThrow(ForbiddenException);
  });
});
