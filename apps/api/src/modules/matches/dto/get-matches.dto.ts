import { IsNumber, IsOptional, IsString, Matches, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Gender filter values accepted on the query string. The PWA FilterBar sends
 * lowercase tokens (`men|women|mixed`, FilterBar.tsx GENDER_KEYS); the DB
 * pgEnum `GenderRule` uses `'Men Only' | 'Women Only' | 'Mixed'`. Both are
 * accepted and normalized server-side — see `normalizeGenderRule`.
 */
export const GENDER_QUERY_VALUES = [
  'men',
  'women',
  'mixed',
  'Men Only',
  'Women Only',
  'Mixed',
] as const;

export type GenderQuery = (typeof GENDER_QUERY_VALUES)[number];

/**
 * Time-of-day discovery presets (run #12). The PWA FilterBar sends one of
 * these tokens as `time`; the service filters on the Riyadh-local hour of
 * `scheduled_at`. `night` deliberately wraps past midnight ([23→04)).
 */
export const TIME_WINDOW_KEYS = [
  'morning',
  'afternoon',
  'evening',
  'night',
] as const;

export type TimeWindowKey = (typeof TIME_WINDOW_KEYS)[number];

/** Riyadh-local wall-clock windows per preset (start inclusive, end exclusive). */
export const TIME_WINDOWS: Record<
  TimeWindowKey,
  { startHour: number; endHour: number }
> = {
  morning: { startHour: 4, endHour: 12 },
  afternoon: { startHour: 12, endHour: 17 },
  evening: { startHour: 17, endHour: 23 },
  night: { startHour: 23, endHour: 4 },
};

/**
 * Maps a query-string gender filter to the DB `GenderRule` enum value.
 *
 * NOTE: 'women' is checked before 'men' — not because equality matching needs
 * it (these are exact === comparisons, no substring matching), but to keep the
 * `"women only".includes("men")` trap visibly guarded against if this is ever
 * refactored to `includes`-style matching (hit historically, see
 * koralink-review-workflow Known bugs: mapGender substring bug).
 */
export function normalizeGenderRule(
  value: GenderQuery,
): 'Men Only' | 'Women Only' | 'Mixed' {
  if (value === 'women' || value === 'Women Only') return 'Women Only';
  if (value === 'men') return 'Men Only';
  if (value === 'mixed') return 'Mixed';
  return value;
}

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
    description: 'Search radius in kilometres (default 50)',
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
    description: 'Filter by gender rule (PWA tokens or DB enum values)',
    example: 'women',
    enum: GENDER_QUERY_VALUES,
  })
  @IsOptional()
  @IsString()
  @IsIn(GENDER_QUERY_VALUES)
  gender?: GenderQuery;

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

  @ApiPropertyOptional({
    description:
      'Filter by time of day (Riyadh local): morning|afternoon|evening|night',
    example: 'evening',
    enum: TIME_WINDOW_KEYS,
  })
  @IsOptional()
  @IsString()
  @IsIn(TIME_WINDOW_KEYS)
  time?: TimeWindowKey;

  @ApiPropertyOptional({
    description: 'Maximum number of matches to return (1-50, default 50)',
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number;
}
