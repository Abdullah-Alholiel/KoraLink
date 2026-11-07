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
