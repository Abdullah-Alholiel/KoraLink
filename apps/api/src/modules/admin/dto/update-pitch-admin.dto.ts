import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** Admin pitch edit — partner UpdatePitchDto fields + cross-venue move. */
export class UpdatePitchAdminDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['5v5', '7v7', '8v8', '11v11'] })
  @IsOptional()
  @IsIn(['5v5', '7v7', '8v8', '11v11'])
  size?: '5v5' | '7v7' | '8v8' | '11v11';

  @ApiPropertyOptional({ enum: ['Grass', 'Artificial'] })
  @IsOptional()
  @IsIn(['Grass', 'Artificial'])
  surface_type?: 'Grass' | 'Artificial';

  @ApiPropertyOptional({ enum: ['Indoor', 'Outdoor'] })
  @IsOptional()
  @IsIn(['Indoor', 'Outdoor'])
  environment?: 'Indoor' | 'Outdoor';

  @ApiPropertyOptional({ description: 'Hourly rate in SAR' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourly_rate?: number;

  @ApiPropertyOptional({ description: 'Availability status' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    description: 'Move the pitch under another venue (admin-only field)',
  })
  @IsOptional()
  @IsString()
  // Run #94 (P2-136): id columns are varchar(36) — shape-validate the
  // cross-venue move target before it reaches any SQL bind.
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'venue_id must be a 36-char UUID-shaped id',
  })
  @MaxLength(36)
  venue_id?: string;
}
