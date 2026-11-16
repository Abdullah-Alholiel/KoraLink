import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { UUID_SHAPE, UUID_SHAPE_MSG } from '../../../common/validation/id-shape';

/**
 * P2-284 (run #179): scope a settlement-generation run to ONE venue. The
 * all-venues run stays the default (venueId omitted) — the scoping exists so
 * one venue with off data can be settled/re-run without touching (or being
 * blocked by) the rest of the payout batch. Shape-validated against the
 * shared UUID_SHAPE (all KoraLink ids are varchar(36)) — NOT @IsUUID
 * (documented convention, see transfer-venue.dto.ts).
 */
export class GenerateSettlementsDto {
  @ApiPropertyOptional({
    description:
      'Scope generation to a single venue (must exist and have pitches). Omit for the all-venues run.',
  })
  @IsOptional()
  @Matches(UUID_SHAPE, { message: `venueId ${UUID_SHAPE_MSG}` })
  venueId?: string;
}
