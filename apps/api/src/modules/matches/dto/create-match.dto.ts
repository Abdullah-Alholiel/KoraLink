import {
  IsString,
  IsNumber,
  IsInt,
  IsEnum,
  IsISO8601,
  IsOptional,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  booking_slot_id?: string;

  @ApiPropertyOptional({ enum: ['public', 'private'], default: 'public',
    description: 'Public matches are discoverable by everyone; private matches are only accessible via the invite link' })
  @IsOptional()
  @IsEnum(['public', 'private'])
  visibility?: 'public' | 'private';
}
