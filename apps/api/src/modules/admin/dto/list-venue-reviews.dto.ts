import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { UUID_SHAPE, UUID_SHAPE_MSG } from '../../../common/validation/id-shape';

export class ListVenueReviewsDto {
  @ApiPropertyOptional({ description: 'Only reviews of this venue' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  @Matches(UUID_SHAPE, { message: `venueId ${UUID_SHAPE_MSG}` })
  venueId?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Omit for both' })
  @IsOptional()
  @IsIn(['true', 'false'])
  hidden?: 'true' | 'false';

  /** P2-336 (run #199): exact-rating filter (1-5). Omit = all ratings. */
  @ApiPropertyOptional({ enum: [1, 2, 3, 4, 5], description: 'Omit for all ratings' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  /** P2-336 (run #199): sort key — whitelist enforced in the service; unknown → default. */
  @ApiPropertyOptional({ description: 'Sort key (whitelist enforced server-side; unknown → default order)' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage: number = 25;
}
