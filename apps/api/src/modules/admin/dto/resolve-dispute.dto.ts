import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ResolveDisputeDto {
  @ApiProperty({ enum: ['resolved', 'rejected'] })
  @IsIn(['resolved', 'rejected'])
  outcome: 'resolved' | 'rejected';

  @ApiPropertyOptional({
    description: 'Free-text decision, e.g. "Uphold penalty (win for host)"',
  })
  @IsOptional()
  @IsString()
  decision?: string;

  @ApiPropertyOptional({ description: 'Internal note, visible to admins only' })
  @IsOptional()
  @IsString()
  internalNote?: string;
}
