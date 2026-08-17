import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Opens a dispute on a match the user participated in. Most common case is a
 * player appealing a no-show mark (type `no_show`); the enum is shared with the
 * `disputes.type` column so other dispute classes can be added without a
 * schema change.
 */
export class CreateDisputeDto {
  @ApiPropertyOptional({
    enum: ['no_show', 'double_booking', 'pitch_condition', 'unrecognized_charge', 'other'],
    default: 'no_show',
  })
  @IsOptional()
  @IsEnum(['no_show', 'double_booking', 'pitch_condition', 'unrecognized_charge', 'other'])
  type?: 'no_show' | 'double_booking' | 'pitch_condition' | 'unrecognized_charge' | 'other';

  @ApiPropertyOptional({ description: 'Player explanation of the appeal' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
