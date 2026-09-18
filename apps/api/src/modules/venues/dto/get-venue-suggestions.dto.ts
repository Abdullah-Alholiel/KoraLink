import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * GET /venues/suggestions — city + neighborhood suggestion chips for the
 * Play and Clubs search bars (search-suggestions feature).
 *
 * `q` is the user's typed prefix (matched against city AND the neighborhood
 * inside the free-text address). `city` is the resolved user city — sent by
 * the PWA when location permission is granted so suggestions lock to the
 * user's city.
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
    description: 'City filter (ILIKE) — the user-resolved city',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}
