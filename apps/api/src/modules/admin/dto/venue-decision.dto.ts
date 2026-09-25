import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class VenueDecisionDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @ApiPropertyOptional({ description: 'Internal note recorded in the audit log' })
  @IsOptional()
  @IsString()
  // Run #73 (Reviewer A): free text is persisted to the audit log — cap it to
  // match every other free-text DTO (dispute reason 1000, chat message 2000).
  @MaxLength(1000)
  note?: string;
}
