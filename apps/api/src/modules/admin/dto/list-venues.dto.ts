import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListVenuesDto {
  @ApiPropertyOptional({ description: 'Search by venue name, city, or owner' })
  @IsOptional()
  @IsString()
  // Run #94 (P2-136): read-only ILIKE inputs — bounded to the partner-DTO
  // convention (create-venue: name 255 / city 100).
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ enum: ['all', 'approved', 'pending', 'rejected'] })
  @IsOptional()
  @IsIn(['all', 'approved', 'pending', 'rejected'])
  status?: 'all' | 'approved' | 'pending' | 'rejected';

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
