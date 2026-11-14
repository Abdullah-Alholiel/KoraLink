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
import { UUID_SHAPE, UUID_SHAPE_MSG } from '../../../common/validation/id-shape';

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
  // silently matching nothing (shared UUID_SHAPE from
  // common/validation/id-shape.ts).
  @Matches(UUID_SHAPE, { message: `venueId ${UUID_SHAPE_MSG}` })
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
