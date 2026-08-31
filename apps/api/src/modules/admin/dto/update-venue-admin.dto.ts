import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/** Admin venue profile edit — mirrors the partner update fields, admin-scoped. */
export class UpdateVenueAdminDto {
  @ApiPropertyOptional({ example: 'Olaya Sports Park' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'Riyadh' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  city?: string;

  @ApiPropertyOptional({ example: 'Prince Turki Rd, Olaya' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  address?: string;

  @ApiPropertyOptional({ example: ['parking', 'showers', 'cafe'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ example: 8, description: 'Daily opening hour 0-23' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  open_hour?: number;

  @ApiPropertyOptional({ example: 23, description: 'Daily closing hour 1-24 (exclusive; 24 = midnight)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  close_hour?: number;

  @IsOptional()
  @IsBoolean()
  closed_day_0?: boolean;
  @IsOptional()
  @IsBoolean()
  closed_day_1?: boolean;
  @IsOptional()
  @IsBoolean()
  closed_day_2?: boolean;
  @IsOptional()
  @IsBoolean()
  closed_day_3?: boolean;
  @IsOptional()
  @IsBoolean()
  closed_day_4?: boolean;
  @IsOptional()
  @IsBoolean()
  closed_day_5?: boolean;
  @IsOptional()
  @IsBoolean()
  closed_day_6?: boolean;
}
