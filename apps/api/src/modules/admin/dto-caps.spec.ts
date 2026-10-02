import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TransferVenueDto } from './dto/transfer-venue.dto';
import { UpdatePitchAdminDto } from './dto/update-pitch-admin.dto';
import { ListPitchesDto } from './dto/list-pitches.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { ListVenuesDto } from './dto/list-venues.dto';

/**
 * Run #94 (Reviewer-A P2-136): admin mutation/query DTO validation caps.
 *
 * House conventions pinned here:
 * - Id-shaped fields: UUID-shape regex + @MaxLength(36) (KoraLink ids are
 *   varchar(36), never native uuid — @IsUUID is the documented drift).
 * - Persisted free text: @MaxLength(1000) (VenueDecisionDto.note class).
 * - Read-only ILIKE inputs: bounded to the partner create-venue convention
 *   (name 255 / city 100).
 *
 * Source-pin assertions read the DTO sources directly (matches/dto-caps
 * tripwire pattern): a future edit that silently drops a cap fails here even
 * if the behavioral cases pass.
 */
const dtoSrc = (f: string) =>
  readFileSync(join(__dirname, 'dto', f), 'utf8');

const VALID_ID = '0b7f6c1e-1111-4222-8333-444455556666';
const errsOn = (
  cls: new () => object,
  payload: Record<string, unknown>,
  prop: string,
) =>
  validateSync(plainToInstance(cls, payload)).filter((e) => e.property === prop);

describe('TransferVenueDto (run #94 cap contract)', () => {
  it('accepts a valid UUID-shaped newOwnerId', () => {
    expect(errsOn(TransferVenueDto, { newOwnerId: VALID_ID }, 'newOwnerId')).toHaveLength(0);
  });

  it('rejects a 37-char id and a non-UUID-shaped string', () => {
    expect(errsOn(TransferVenueDto, { newOwnerId: 'x'.repeat(37) }, 'newOwnerId').length).toBeGreaterThan(0);
    expect(errsOn(TransferVenueDto, { newOwnerId: 'not-an-id' }, 'newOwnerId').length).toBeGreaterThan(0);
  });

  it('source-pins the @MaxLength(36) cap', () => {
    expect(dtoSrc('transfer-venue.dto.ts')).toContain('@MaxLength(36)');
  });
});

describe('UpdatePitchAdminDto (run #94 cap contract)', () => {
  it('accepts a valid venue_id', () => {
    const dto = plainToInstance(UpdatePitchAdminDto, { venue_id: VALID_ID });
    expect(validateSync(dto).filter((e) => e.property === 'venue_id')).toHaveLength(0);
  });

  it('rejects an unshaped venue_id', () => {
    const dto = plainToInstance(UpdatePitchAdminDto, { venue_id: 'garbage' });
    expect(validateSync(dto).some((e) => e.property === 'venue_id')).toBe(true);
  });

  it('source-pins the @MaxLength(36) cap', () => {
    expect(dtoSrc('update-pitch-admin.dto.ts')).toContain('@MaxLength(36)');
  });
});

describe('ListPitchesDto (run #94 cap contract)', () => {
  it('accepts a valid venueId filter', () => {
    const dto = plainToInstance(ListPitchesDto, { venueId: VALID_ID });
    expect(validateSync(dto).filter((e) => e.property === 'venueId')).toHaveLength(0);
  });

  it('rejects an unshaped venueId', () => {
    const dto = plainToInstance(ListPitchesDto, { venueId: 'garbage' });
    expect(validateSync(dto).some((e) => e.property === 'venueId')).toBe(true);
  });

  it('bounds search at 255 chars', () => {
    const ok = plainToInstance(ListPitchesDto, { search: 'x'.repeat(255) });
    expect(validateSync(ok).some((e) => e.property === 'search')).toBe(false);
    const over = plainToInstance(ListPitchesDto, { search: 'x'.repeat(256) });
    expect(validateSync(over).some((e) => e.property === 'search')).toBe(true);
  });
});

describe('ResolveDisputeDto (run #94 cap contract)', () => {
  it('accepts decision + internalNote at the 1000-char cap', () => {
    const dto = plainToInstance(ResolveDisputeDto, {
      outcome: 'resolved',
      decision: 'd'.repeat(1000),
      internalNote: 'n'.repeat(1000),
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects 1001-char decision or internalNote', () => {
    const over = plainToInstance(ResolveDisputeDto, {
      outcome: 'resolved',
      decision: 'd'.repeat(1001),
    });
    expect(validateSync(over).some((e) => e.property === 'decision')).toBe(true);
    const overNote = plainToInstance(ResolveDisputeDto, {
      outcome: 'resolved',
      internalNote: 'n'.repeat(1001),
    });
    expect(validateSync(overNote).some((e) => e.property === 'internalNote')).toBe(true);
  });

  it('source-pins both @MaxLength(1000) caps', () => {
    const src = dtoSrc('resolve-dispute.dto.ts');
    expect(src.match(/@MaxLength\(1000\)/g)?.length).toBe(2);
  });
});

describe('ListVenuesDto (run #94 cap contract)', () => {
  it('bounds search (255) and city (100)', () => {
    const ok = plainToInstance(ListVenuesDto, { search: 'x'.repeat(255), city: 'y'.repeat(100) });
    expect(validateSync(ok)).toHaveLength(0);
    const over = plainToInstance(ListVenuesDto, { search: 'x'.repeat(256), city: 'y'.repeat(101) });
    const errs = validateSync(over);
    expect(errs.some((e) => e.property === 'search')).toBe(true);
    expect(errs.some((e) => e.property === 'city')).toBe(true);
  });
});
