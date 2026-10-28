import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'Wallet refund credited to the reporter (SAR, >0, ≤2dp) when outcome=resolved. ' +
      'Rides the resolve transaction; idempotent per dispute (one refund per case).',
    example: 37,
    minimum: 0.01,
    maximum: 999999,
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'refundAmountSar must be a number with at most 2 decimal places' },
  )
  @Min(0.01)
  @Max(999999)
  refundAmountSar?: number;
}
