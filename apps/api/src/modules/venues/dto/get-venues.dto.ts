import {
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsString,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetVenuesDto {
  @ApiPropertyOptional({ description: 'Free-text search on venue name or city (additive ILIKE)', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ description: 'Latitude for geo-filter', minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude for geo-filter', minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ description: 'Search radius in km', minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  radius_km?: number;

  @ApiPropertyOptional({ description: 'City name filter' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ description: 'Filter to KoraLink partner venues only' })
  @IsOptional()
  @Type(() => Boolean)
  is_koralink_partner?: boolean;

  @ApiPropertyOptional({
    description:
      'List ordering. top_rated = rating_avg DESC (NULLs last), rating_count DESC, name ASC — coordinates are ignored when sorting by rating. Absent = distance (coords) or name order.',
    enum: ['distance', 'top_rated'],
    default: 'distance',
  })
  @IsOptional()
  @IsIn(['distance', 'top_rated'])
  sort?: 'distance' | 'top_rated';
}
