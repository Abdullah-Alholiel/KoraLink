import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateReportDto } from './reports/dto/create-report.dto';
import { TopupWalletDto } from './wallet/dto/topup-wallet.dto';

/**
 * Run #77 (P2-113, Reviewer A minors): id-bearing / ledger-key DTO caps.
 *
 * - CreateReportDto.subjectId binds against varchar(36) id columns — must be
 *   UUID-shaped + bounded (same convention as CastVoteDto.candidateId, run #73).
 * - TopupWalletDto.idempotencyKey is free-form but must be bounded printable
 *   ASCII (no blob abuse); the DB-unique backstop is unchanged.
 */
describe('CreateReportDto (run #77 shape contract)', () => {
  const VALID = '31e5650e-2a38-4781-9807-913b9c913c90';

  it('accepts a UUID-shaped subjectId with a valid reason', () => {
    const dto = plainToInstance(CreateReportDto, {
      subjectType: 'user',
      subjectId: VALID,
      reason: 'spam profile',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a non-UUID subjectId', () => {
    const dto = plainToInstance(CreateReportDto, {
      subjectType: 'user',
      subjectId: 'not-an-id',
      reason: 'spam profile',
    });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'subjectId')).toBe(true);
  });

  it('rejects an overlong subjectId (>36 chars)', () => {
    const dto = plainToInstance(CreateReportDto, {
      subjectType: 'match',
      subjectId: VALID + '-extra',
      reason: 'x',
    });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'subjectId')).toBe(true);
  });
});

describe('TopupWalletDto.idempotencyKey (run #77 charset contract)', () => {
  it('accepts a typical client-generated key', () => {
    const dto = plainToInstance(TopupWalletDto, {
      amount: 50,
      idempotencyKey: 'topup_abc123',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts a UUID-style key with hyphens', () => {
    const dto = plainToInstance(TopupWalletDto, {
      amount: 50,
      idempotencyKey: '31e5650e-2a38-4781-9807-913b9c913c90',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects keys with whitespace/control characters', () => {
    const dto = plainToInstance(TopupWalletDto, {
      amount: 50,
      idempotencyKey: 'bad key\nwith newline',
    });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'idempotencyKey')).toBe(true);
  });

  it('rejects a key longer than 255 chars', () => {
    const dto = plainToInstance(TopupWalletDto, {
      amount: 50,
      idempotencyKey: 'k'.repeat(256),
    });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'idempotencyKey')).toBe(true);
  });
});
