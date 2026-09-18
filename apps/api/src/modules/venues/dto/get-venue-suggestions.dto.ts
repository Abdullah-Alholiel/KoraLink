import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * GET /venues/suggestions — city + neighborhood suggestion chips for the
 * Play and Clubs search bars (search-suggestions feature).
 *
 * City resolution precedence (the "exact user city" contract):
 *   1. `lat`/`lng` — location permission granted: the city is resolved
 *      server-side as the NEAREST approved venue's city (PostGIS, no external
 *      geocoder). Suggestions lock to that city.
 *   2. `city` — the profile's preferred location (user-typed city), ILIKE.
 *   3. Neither — city-wide suggestions across all cities.
 *
 * `q` is the user's typed prefix (matched against city AND the neighborhood
 * inside the free-text address).
 */
export class GetVenueSuggestionsDto {
  @ApiPropertyOptional({
    description: 'Free-text prefix matched against venue city and address',
    maxLength: 80,
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({
    description: 'City filter (ILIKE) — the profile preferred location',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'User latitude (resolves nearest city)' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat?: number;

  @ApiPropertyOptional({ description: 'User longitude (resolves nearest city)' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng?: number;
}
