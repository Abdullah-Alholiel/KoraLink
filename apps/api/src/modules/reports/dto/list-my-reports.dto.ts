import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * P2-31(2) (run #23): query params for the reporter-closure mine-list.
 * Mirrors the GetMatchesDto limit/offset conventions (Type() + Min/Max bounds;
 * validationpipe has forbidNonWhitelisted — these are the ONLY allowed params).
 */
export class ListMyReportsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
