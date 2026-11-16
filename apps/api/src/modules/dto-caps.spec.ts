import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateReportDto } from './reports/dto/create-report.dto';

/**
 * Run #77 (P2-113, Reviewer A minors): id-bearing / ledger-key DTO caps.
 *
 * - CreateReportDto.subjectId binds against varchar(36) id columns — must be
 *   UUID-shaped + bounded (same convention as CastVoteDto.candidateId, run #73).
 * - (TopupWalletDto was deleted with the legacy POST /wallet/topup route in
 *   P2-331; its charset block went with it.)
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
