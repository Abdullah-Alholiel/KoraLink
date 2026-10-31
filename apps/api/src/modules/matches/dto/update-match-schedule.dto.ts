import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

import { UUID_SHAPE, UUID_SHAPE_MSG } from '../../../common/validation/id-shape';

/**
 * PATCH /matches/:id/schedule — move a koralink match to a different free
 * slot on the same pitch. Host-only (enforced in the service, mirroring
 * cancelMatch). The new slot's (slot_date, start_time, end_time) fully
 * determine the new scheduled_at + duration — server-authoritative, same
 * derivation as createMatch.
 */
export class UpdateMatchScheduleDto {
  @ApiProperty({
    description: 'ID of a FREE pitch slot (same pitch as the match) to move the match to.',
    example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  })
  // Run #105 rider (Reviewer A): house id convention — UUID-shape @Matches +
  // @MaxLength(36) per id-shape.ts (was a bare @Length(36,36) that accepted
  // any 36-char string; drift the shared validator was created to stop).
  @IsString()
  @IsNotEmpty()
  @Matches(UUID_SHAPE, { message: `booking_slot_id ${UUID_SHAPE_MSG}` })
  @MaxLength(36)
  booking_slot_id!: string;
}
