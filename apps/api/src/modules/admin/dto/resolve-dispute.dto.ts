import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveDisputeDto {
  @ApiProperty({ enum: ['resolved', 'rejected'] })
  @IsIn(['resolved', 'rejected'])
  outcome: 'resolved' | 'rejected';

  @ApiPropertyOptional({
    description: 'Free-text decision, e.g. "Uphold penalty (win for host)"',
  })
  @IsOptional()
  @IsString()
  // Run #94 (P2-136): persisted verbatim — capped like every other free-text
  // DTO (VenueDecisionDto.note class: unbounded audit payloads).
  @MaxLength(1000)
  decision?: string;

  @ApiPropertyOptional({ description: 'Internal note, visible to admins only' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}
