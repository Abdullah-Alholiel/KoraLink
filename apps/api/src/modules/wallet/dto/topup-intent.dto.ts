import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Top-up bounds in SAR (module contract — mirrored in the PWA config screen). */
export const MIN_TOPUP_SAR = 5;
export const MAX_TOPUP_SAR = 2000;

export class TopupIntentDto {
  @ApiProperty({
    description: 'Top-up amount in SAR (5–2000, max 2 decimal places)',
    example: 50,
    minimum: MIN_TOPUP_SAR,
    maximum: MAX_TOPUP_SAR,
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'amountSar must be a number with at most 2 decimal places' })
  @Min(MIN_TOPUP_SAR)
  @Max(MAX_TOPUP_SAR)
  amountSar!: number;

  @ApiProperty({
    description: 'Client-generated UUID making intent creation idempotent',
    example: 'b1e2c3d4-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  })
  @IsUUID()
  idempotencyKey!: string;
}
