import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { VenueDecisionDto } from '../admin/dto/venue-decision.dto';
import { CastVoteDto } from './dto/cast-vote.dto';
import { CreateMatchDto } from './dto/create-match.dto';

/**
 * Run #73 (Reviewer A minors): DTO validation-cap contract.
 *
 * - VenueDecisionDto.note is persisted verbatim into the admin audit log —
 *   it must be length-capped like every other free-text DTO (run-#36 class:
 *   unbounded audit payloads).
 * - CastVoteDto.candidateId reaches a SQL bind against a varchar(36) id
 *   column — it must be UUID-shaped and bounded at 36 chars (KoraLink id
 *   convention: varchar(36), never native uuid; @IsUUID is the drifted form —
 *   the run-#41 board note pins shape validation as the house style).
 *
 * Shape assertions read the DTO source directly (mirrors the PWA's
 * csp-config tripwire pattern): a future edit that silently drops the cap
 * fails here even if the behavioral cases pass.
 */
const venueDecisionSrc = readFileSync(
  join(__dirname, '..', 'admin', 'dto', 'venue-decision.dto.ts'),
  'utf8',
);
const castVoteSrc = readFileSync(
  join(__dirname, 'dto', 'cast-vote.dto.ts'),
  'utf8',
);
const createMatchSrc = readFileSync(
  join(__dirname, 'dto', 'create-match.dto.ts'),
  'utf8',
);

describe('VenueDecisionDto (run #73 cap contract)', () => {
  it('note carries @MaxLength(1000)', () => {
    expect(venueDecisionSrc).toContain('@MaxLength(1000)');
  });

  it('accepts a valid decision + note', () => {
    const dto = plainToInstance(VenueDecisionDto, {
      decision: 'approve',
      note: 'photos verified',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects an oversized note (1001 chars)', () => {
    const dto = plainToInstance(VenueDecisionDto, {
      decision: 'reject',
      note: 'x'.repeat(1001),
    });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'note')).toBe(true);
  });

  it('rejects a decision outside the enum', () => {
    const dto = plainToInstance(VenueDecisionDto, { decision: 'maybe' });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'decision')).toBe(true);
  });
});

describe('CastVoteDto (run #73 shape contract)', () => {
  it('candidateId is UUID-shaped + capped at 36 chars, no @IsUUID drift', () => {
    expect(castVoteSrc).toContain('@MaxLength(36)');
    expect(castVoteSrc).toMatch(/@Matches\(/);
    expect(castVoteSrc).not.toContain('@IsUUID');
  });

  it('accepts a UUID-shaped candidateId', () => {
    const dto = plainToInstance(CastVoteDto, {
      candidateId: '31e5650e-2a38-4781-9807-913b9c913c90',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts uppercase UUID shape (case-insensitive)', () => {
    const dto = plainToInstance(CastVoteDto, {
      candidateId: '31E5650E-2A38-4781-9807-913B9C913C90',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a non-UUID string', () => {
    const dto = plainToInstance(CastVoteDto, { candidateId: 'not-an-id' });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'candidateId')).toBe(true);
  });

  it('rejects an overlong value (>36 chars)', () => {
    const dto = plainToInstance(CastVoteDto, {
      candidateId: '31e5650e-2a38-4781-9807-913b9c913c90-extra',
    });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'candidateId')).toBe(true);
  });
});

describe('CreateMatchDto.booking_slot_id (P2-139 shape contract)', () => {
  // Only booking_slot_id is under test — other CreateMatchDto fields are
  // omitted, so assert on this property's errors alone.
  const slotErrors = (booking_slot_id: unknown) =>
    validateSync(plainToInstance(CreateMatchDto, { booking_slot_id })).filter(
      (e) => e.property === 'booking_slot_id',
    );

  it('booking_slot_id is UUID-shaped + capped at 36 chars, no @IsUUID drift', () => {
    // Scope the source assertions to booking_slot_id's OWN decorator block —
    // file-wide contains() would pass vacuously if another field carried the
    // same decorators (PR-Agent r2 finding).
    const idx = createMatchSrc.indexOf('booking_slot_id?:');
    expect(idx).toBeGreaterThan(-1);
    const block = createMatchSrc.slice(Math.max(0, idx - 500), idx);
    expect(block).toContain('@MaxLength(36)');
    expect(block).toContain('@Matches(');
    expect(block).not.toContain('@IsUUID');
  });

  it('accepts a UUID-shaped booking_slot_id', () => {
    expect(slotErrors('31e5650e-2a38-4781-9807-913b9c913c90')).toHaveLength(0);
  });

  it('accepts uppercase UUID shape (case-insensitive)', () => {
    expect(slotErrors('31E5650E-2A38-4781-9807-913B9C913C90')).toHaveLength(0);
  });

  it('rejects an overlong value (37 chars)', () => {
    expect(slotErrors('31e5650e-2a38-4781-9807-913b9c913c90a')).not.toHaveLength(0);
  });

  it('rejects a non-UUID string', () => {
    expect(slotErrors('slot-1')).not.toHaveLength(0);
  });
});
