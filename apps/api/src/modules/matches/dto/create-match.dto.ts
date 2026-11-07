import {
  IsString,
  IsNumber,
  IsInt,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UUID_SHAPE, UUID_SHAPE_MSG } from '../../../common/validation/id-shape';

export class CreateMatchDto {
  @ApiProperty({ description: 'Pitch UUID' })
  @IsString()
  pitch_id: string;

  @ApiProperty({ description: 'Match title', minLength: 3, maxLength: 255 })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title: string;

  @ApiProperty({ enum: ['Casual', 'Competitive'] })
  @IsEnum(['Casual', 'Competitive'])
  match_type: 'Casual' | 'Competitive';

  @ApiProperty({ enum: ['Men Only', 'Women Only', 'Mixed'] })
  @IsEnum(['Men Only', 'Women Only', 'Mixed'])
  gender_rule: 'Men Only' | 'Women Only' | 'Mixed';

  @ApiProperty({ description: 'Scheduled kick-off time (ISO 8601)' })
  @IsISO8601()
  scheduled_at: string;

  @ApiProperty({ description: 'Match duration in minutes', minimum: 30, maximum: 180 })
  @IsInt()
  @Min(30)
  @Max(180)
  duration_mins: number;

  @ApiProperty({ description: 'Maximum number of players', minimum: 2, maximum: 22 })
  @IsInt()
  @Min(2)
  @Max(22)
  max_players: number;

  @ApiPropertyOptional({ description: 'Total pitch rental cost in SAR (supports decimals). Deprecated — the server derives this from the pitch hourly_rate × duration; any client value is ignored.', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pitchCostSar?: number;

  @ApiPropertyOptional({ enum: ['koralink', 'self'], default: 'koralink',
    description: 'Who handles pitch booking — koralink = we book it, self = host books it. Defaults to koralink.' })
  @IsOptional()
  @IsEnum(['koralink', 'self'])
  booking_mode?: 'koralink' | 'self';

  @ApiPropertyOptional({ description: 'Slot ID — required when booking_mode = koralink' })
  @IsOptional()
  @IsString()
  // P2-139 rider: reaches a SQL bind against varchar(36) pitch_slots.id —
  // shape-validate via the shared id-shape (no UUID-scheme decorator), cap at 36.
  @Matches(UUID_SHAPE, { message: `booking_slot_id ${UUID_SHAPE_MSG}` })
  @MaxLength(36)
  booking_slot_id?: string;

  @ApiPropertyOptional({ enum: ['public', 'private'], default: 'public',
    description: 'Public matches are discoverable by everyone; private matches are only accessible via the invite link' })
  @IsOptional()
  @IsEnum(['public', 'private'])
  visibility?: 'public' | 'private';

  @ApiPropertyOptional({ description: 'Host accepted the hosting responsibility terms (responsibility split, payout held until completion, refund policy). The service rejects the booking when absent/false.' })
  @IsOptional()
  @IsBoolean()
  acceptedHostingTerms?: boolean;

  @ApiPropertyOptional({
    description: 'Create N weekly instances of this match (koralink booking mode only). Omit or 1 = single match.',
    minimum: 1,
    maximum: 8,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  repeat_weeks?: number;
}
