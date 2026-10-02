import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListPitchesDto {
  @ApiPropertyOptional({ description: 'Search by pitch, venue, or owner name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by venue id' })
  @IsOptional()
  @IsString()
  // Run #94 (P2-136): reaches the raw-SQL WHERE as a bound param — bound, so
  // never injectable, but shape-validate anyway so garbage ids 400 instead of
  // silently matching nothing.
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'venueId must be a 36-char UUID-shaped id',
  })
  @MaxLength(36)
  venueId?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage: number = 20;
}
