import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListSettlementsDto {
  @ApiPropertyOptional({ enum: ['pending', 'paid', 'failed'] })
  @IsOptional()
  @IsIn(['pending', 'paid', 'failed'])
  status?: 'pending' | 'paid' | 'failed';

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
