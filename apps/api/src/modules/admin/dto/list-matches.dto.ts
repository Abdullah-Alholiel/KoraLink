import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
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
}
