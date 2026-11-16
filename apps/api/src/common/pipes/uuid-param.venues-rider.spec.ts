import { BadRequestException } from '@nestjs/common';
import { UuidParamPipe } from './uuid-param.pipe';
import { GetVenuesDto } from '../../modules/venues/dto/get-venues.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * Run #113 riders — pins for the validation added alongside P2-167:
 * (1) UuidParamPipe on the player-facing venues controller :id routes
 *     (extends the P2-164 class; malformed id → 400 with the shared message),
 * (2) get-venues.dto `city` @MaxLength(80) — sibling `search` was already
 *     capped; an unbounded city string reached the ILIKE clause.
 *
 * Pipe behavior is validated directly through the pipe instance (the
 * decorator wiring itself is pinned by the live-tree tripwire spec from
 * run #112, which fails on any future bare `@Param('id')`).
 */
describe('Run #113 — venues validation riders', () => {
  const pipe = new UuidParamPipe();
  const VALID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

  it('UuidParamPipe passes a UUID-shaped id through unchanged', () => {
    expect(pipe.transform(VALID)).toBe(VALID);
  });

  it('UuidParamPipe 400s malformed ids with the shared shape message', () => {
    expect(() => pipe.transform('favorites')).toThrow(BadRequestException);
    expect(() => pipe.transform('')).toThrow(BadRequestException);
    expect(() => pipe.transform(`${VALID}x`)).toThrow(BadRequestException);
  });

  it('UuidParamPipe rejects non-string values (defense-in-depth; route params are strings)', () => {
    expect(() => pipe.transform(undefined as unknown as string)).toThrow(BadRequestException);
    expect(() => pipe.transform(123 as unknown as string)).toThrow(BadRequestException);
  });

  it('city DTO field rejects 81+ chars and accepts 80 (real validation metadata, not the validator fn)', async () => {
    const tooLong = plainToInstance(GetVenuesDto, { city: 'x'.repeat(81) }) as unknown as object;
    const tooLongErrors = await validate(tooLong);
    expect(tooLongErrors.some((e) => e.property === 'city' && e.constraints?.maxLength)).toBe(
      true,
    );

    const atCap = plainToInstance(GetVenuesDto, { city: 'x'.repeat(80) }) as unknown as object;
    const atCapErrors = await validate(atCap);
    expect(atCapErrors.some((e) => e.property === 'city')).toBe(false);
  });
});
