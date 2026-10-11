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

  /** SLA triage filter (run #122). `escalated` → the PERSISTED sla_escalated flag
   * (set by the daily sweep; flag+row-lock is the only idempotency contract, so
   * the filter MUST read the flag, not the evidence history — PR #105 r3).
   * `breaching` → the sweep-window predicate (updated_at + 7d < now) over rows
   * the sweep has not yet escalated. */
  @ApiPropertyOptional({ enum: ['escalated', 'breaching'] })
  @IsOptional()
  @IsIn(['escalated', 'breaching'])
  sla?: 'escalated' | 'breaching';

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
