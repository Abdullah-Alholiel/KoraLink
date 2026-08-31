import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Admin match edit — metadata corrections (title/type/gender) for any
 * Open/InProgress match, plus schedule corrections for SELF-booked matches
 * (koralink-booked schedule moves belong to the host reschedule flow —
 * money-safe by design, see AdminMatchesService.update).
 */
export class UpdateMatchAdminDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ enum: ['Casual', 'Competitive'] })
  @IsOptional()
  @IsIn(['Casual', 'Competitive'])
  match_type?: 'Casual' | 'Competitive';

  @ApiPropertyOptional({ enum: ['Men Only', 'Women Only', 'Mixed'] })
  @IsOptional()
  @IsIn(['Men Only', 'Women Only', 'Mixed'])
  gender_rule?: 'Men Only' | 'Women Only' | 'Mixed';

  @ApiPropertyOptional({ description: 'New start time (ISO 8601, future)' })
  @IsOptional()
  @IsISO8601()
  scheduled_at?: string;

  @ApiPropertyOptional({ description: 'New duration in minutes' })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(480)
  duration_mins?: number;
}
