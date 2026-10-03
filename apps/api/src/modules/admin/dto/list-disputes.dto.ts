import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListDisputesDto {
  @ApiPropertyOptional({ enum: ['opened', 'under_review', 'resolved', 'rejected'] })
  @IsOptional()
  @IsIn(['opened', 'under_review', 'resolved', 'rejected'])
  status?: 'opened' | 'under_review' | 'resolved' | 'rejected';

  /**
   * Appeal-visibility filter (run #98, t_e6dccff7). Players attach appeals as
   * JSON evidence entries on an existing dispute (or open one with a reason),
   * so "has an appeal" is an EXISTS probe over the evidence array — not a
   * column. `true` → only disputes carrying an appeal entry; `false` → only
   * disputes without one. Omitted → no appeal predicate.
   */
  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Filter by appeal presence' })
  @IsOptional()
  @IsIn(['true', 'false'])
  appeal?: 'true' | 'false';

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
