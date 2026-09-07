import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListMatchesDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number;

  @ApiPropertyOptional({ enum: ['Open', 'Full', 'InProgress', 'Completed', 'Cancelled'] })
  @IsOptional()
  @IsEnum(['Open', 'Full', 'InProgress', 'Completed', 'Cancelled'])
  status?: 'Open' | 'Full' | 'InProgress' | 'Completed' | 'Cancelled';

  @ApiPropertyOptional({ description: 'Sort key (whitelist enforced server-side; unknown → default order)' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';
}
