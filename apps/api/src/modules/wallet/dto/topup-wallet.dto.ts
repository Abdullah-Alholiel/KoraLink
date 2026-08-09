import {
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
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
  @IsString()
  @MaxLength(255)
  idempotencyKey: string;
}
