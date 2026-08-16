import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListDisputesDto {
  @ApiPropertyOptional({ enum: ['opened', 'under_review', 'resolved', 'rejected'] })
  @IsOptional()
  @IsIn(['opened', 'under_review', 'resolved', 'rejected'])
  status?: 'opened' | 'under_review' | 'resolved' | 'rejected';

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
