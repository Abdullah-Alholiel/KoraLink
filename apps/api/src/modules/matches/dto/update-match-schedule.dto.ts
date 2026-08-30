import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

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
  @IsString()
  @IsNotEmpty()
  @Length(36, 36)
  booking_slot_id!: string;
}
