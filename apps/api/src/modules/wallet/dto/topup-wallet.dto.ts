import {
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
  Matches,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TopupWalletDto {
  @ApiProperty({
    description: 'Top-up amount in SAR',
    minimum: 1,
    maximum: 10000,
    example: 50,
  })
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(10000)
  amount: number;

  @ApiPropertyOptional({
    description: 'Reference ID (e.g. payment gateway transaction ID)',
    maxLength: 36,
  })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  referenceId?: string;

  @ApiProperty({
    description: 'Idempotency key to prevent duplicate top-ups',
    maxLength: 255,
    example: 'topup_abc123',
  })
  // P2-113 (run #77, Reviewer A): ledger keys are free-form but must stay
  // printable ASCII (no blob abuse); DB-unique backstop unchanged.
  @IsString()
  @Matches(/^[A-Za-z0-9._:\/-]{1,255}$/, {
    message: 'idempotencyKey must be 1-255 printable ASCII characters (letters, digits, dot, underscore, colon, slash, hyphen)',
  })
  @MaxLength(255)
  idempotencyKey: string;
}
