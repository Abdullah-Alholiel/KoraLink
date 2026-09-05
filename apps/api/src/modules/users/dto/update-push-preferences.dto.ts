import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Push delivery preferences (P1-20, run #13). All fields optional — a PATCH
 * updates only the fields present. Quiet hours are Riyadh-local wall-clock
 * hours (0-23) and may wrap midnight (e.g. start 23, end 7).
 *
 * P0-5 (run #28) adds `categoryMutes` — a per-category opt-out (match / chat /
 * promo / system). Each key is itself optional: present + `true` mutes the
 * category, present + `false` un-mutes, absent leaves the stored value
 * untouched. Omitting `categoryMutes` entirely is a no-op for the table.
 */
export class CategoryMutesDto {
  @ApiPropertyOptional({ description: 'Mute match lifecycle pushes (kickoff / cancel / reschedule / POTM).' })
  @IsOptional() @IsBoolean()
  match?: boolean;

  @ApiPropertyOptional({ description: 'Mute direct-message pushes.' })
  @IsOptional() @IsBoolean()
  chat?: boolean;

  @ApiPropertyOptional({ description: 'Mute promotional pushes (reserved for future use).' })
  @IsOptional() @IsBoolean()
  promo?: boolean;

  @ApiPropertyOptional({
    description: 'Mute system pushes (account actions, report resolution, admin notices).'
  })
  @IsOptional() @IsBoolean()
  system?: boolean;
}

export class UpdatePushPreferencesDto {
  @ApiPropertyOptional({ description: 'Silence all push notifications' })
  @IsOptional()
  @IsBoolean()
  pushMuted?: boolean;

  @ApiPropertyOptional({ description: 'Mute ALL transactional email (independent of push)' })
  @IsOptional()
  @IsBoolean()
  emailMuted?: boolean;

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

  @ApiPropertyOptional({
    description:
      'Per-category push mutes. Each key is optional; only the present keys are written.',
    type: CategoryMutesDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryMutesDto)
  categoryMutes?: CategoryMutesDto;
}
