import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';

/**
 * Push delivery preferences (P1-20, run #13). All fields optional — a PATCH
 * updates only the fields present. Quiet hours are Riyadh-local wall-clock
 * hours (0-23) and may wrap midnight (e.g. start 23, end 7).
 */
export class UpdatePushPreferencesDto {
  @ApiPropertyOptional({ description: 'Silence all push notifications' })
  @IsOptional()
  @IsBoolean()
  pushMuted?: boolean;

  @ApiPropertyOptional({ description: 'Enable the quiet-hours window' })
  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Quiet-hours start hour, Riyadh local (0-23)',
    minimum: 0,
    maximum: 23,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietStartHour?: number;

  @ApiPropertyOptional({
    description: 'Quiet-hours end hour, Riyadh local (0-23)',
    minimum: 0,
    maximum: 23,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietEndHour?: number;
}
