import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VerifyTopupDto } from './verify-topup.dto';

/**
 * Regression (2026-11-13, first real sandbox top-up on staging): the DTO only accepted
 * `pay_<id>`, but Moyasar payment ids are UUIDs, so POST /wallet/topup/verify answered
 * 400 for every real payment. These specs pin the real shape at the DTO wall.
 */
const INTENT_ID = 'b1e2c3d4-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

async function paymentIdErrors(paymentId: unknown): Promise<number> {
  const dto = plainToInstance(VerifyTopupDto, { paymentId, intentId: INTENT_ID });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'paymentId').length;
}

describe('VerifyTopupDto.paymentId', () => {
  it('accepts a real Moyasar payment id (UUID)', async () => {
    expect(await paymentIdErrors('94924fcf-64c5-4b0f-9472-eed05cae5ee2')).toBe(0);
    expect(await paymentIdErrors('EEB6923E-6A90-43E9-9917-97A98CB0A2A6')).toBe(0);
  });

  it('still accepts the legacy pay_<id> fixture shape', async () => {
    expect(await paymentIdErrors('pay_test1234567890')).toBe(0);
  });

  it.each([
    ['empty', ''],
    ['free text', 'not-a-payment'],
    ['truncated uuid', '94924fcf-64c5-4b0f-9472'],
    ['path traversal', '../payments'],
    ['uuid with a path suffix', '94924fcf-64c5-4b0f-9472-eed05cae5ee2/refund'],
    ['uuid with a query suffix', '94924fcf-64c5-4b0f-9472-eed05cae5ee2?x=1'],
    ['leading space', ' 94924fcf-64c5-4b0f-9472-eed05cae5ee2'],
    ['bare pay_ prefix', 'pay_'],
    ['number', 12345],
  ])('rejects %s', async (_name, value) => {
    expect(await paymentIdErrors(value)).toBeGreaterThan(0);
  });
});
