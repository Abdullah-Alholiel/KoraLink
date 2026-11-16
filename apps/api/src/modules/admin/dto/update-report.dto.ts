import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

export class UpdateReportDto {
  @ApiPropertyOptional({ description: 'Resolution text; null clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string | null;

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
