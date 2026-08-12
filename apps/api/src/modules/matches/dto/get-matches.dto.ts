import { IsNumber, IsOptional, IsString, Matches, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetMatchesDto {
  @ApiPropertyOptional({
    description: 'Latitude of the player (WGS-84)',
    example: 24.7136,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({
    description: 'Longitude of the player (WGS-84)',
    example: 46.6753,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({
    description: 'Search radius in kilometres (default 10)',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  radius_km?: number;

  @ApiPropertyOptional({
    description: 'Filter by date (YYYY-MM-DD)',
    example: '2025-08-15',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;

  @ApiPropertyOptional({
    description: 'Filter by pitch format',
    example: '7v7',
  })
  @IsOptional()
  @IsString()
  @IsIn(['5v5', '7v7', '8v8', '11v11'])
  format?: string;

  @ApiPropertyOptional({
    description: 'Filter by gender rule',
    example: 'Men Only',
  })
  @IsOptional()
  @IsString()
  @IsIn(['Men Only', 'Women Only', 'Mixed'])
  gender?: string;

  @ApiPropertyOptional({
    description: 'Filter by max price per player (SAR)',
    example: 50,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  max_price?: number;

  @ApiPropertyOptional({
    description: 'Filter by venue ID',
    example: 'venue-uuid',
  })
  @IsOptional()
  @IsString()
  venue_id?: string;
}
