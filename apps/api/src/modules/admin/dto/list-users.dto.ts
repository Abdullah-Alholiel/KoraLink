import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListUsersDto {
  @ApiPropertyOptional({ description: 'Search by name, phone, or handle' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['Player', 'VenueOwner', 'Admin'] })
  @IsOptional()
  @IsIn(['Player', 'VenueOwner', 'Admin'])
  role?: 'Player' | 'VenueOwner' | 'Admin';

  @ApiPropertyOptional({ enum: ['all', 'active', 'banned', 'suspended'] })
  @IsOptional()
  @IsIn(['all', 'active', 'banned', 'suspended'])
  status?: 'all' | 'active' | 'banned' | 'suspended';

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
