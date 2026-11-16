import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateDisputeDto {
  @ApiPropertyOptional({ description: 'Decision text; null clears it' })
  @IsOptional()
  @IsString()
  decision?: string | null;

  @ApiPropertyOptional({ description: 'Internal note, admins only; null clears it' })
  @IsOptional()
  @IsString()
  internalNote?: string | null;

  @ApiPropertyOptional({
    description:
      'Optimistic-edit token (P2-192): the version the client saw. Absent = legacy client, guard skipped. On 409 the body echoes the current version.',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version?: number;
}
