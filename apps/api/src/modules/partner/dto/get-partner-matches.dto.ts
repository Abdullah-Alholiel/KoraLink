import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Match statuses accepted by `?status=` (mirror of the DB match_status enum). */
const MATCH_STATUSES = ['Open', 'Full', 'InProgress', 'Completed', 'Cancelled'] as const;

/**
 * Query params for GET /partner/matches — the partner's match/roster ops view
 * (P1-26). Defaults to the Riyadh-local "today" window; ALL statuses by
 * default (ops surface — today's view includes cancelled/completed);
 * `?status=` narrows. `scope=upcoming` switches to "now and later".
 */
export class GetPartnerMatchesDto {
  @ApiPropertyOptional({
    description: 'Window: today (Riyadh calendar day) or upcoming (now and later)',
    example: 'today',
    enum: ['today', 'upcoming'],
  })
  @IsOptional()
  @IsIn(['today', 'upcoming'])
  scope?: 'today' | 'upcoming';

  @ApiPropertyOptional({
    description: 'Filter by match status',
    example: 'Open',
    enum: MATCH_STATUSES,
  })
  @IsOptional()
  @IsIn(MATCH_STATUSES)
  status?: (typeof MATCH_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Page size (default 50, max 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Rows to skip (default 0)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
