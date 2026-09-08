import { IsPhoneNumber, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * P1-19 (run #44): step 2 of the phone-change flow — consume the OTP that
 * was dispatched to `phone` and move the account onto it. `phone` must be
 * the SAME number the request step sent the code to (the stored code is
 * keyed by the number — a code for A can never move the account to B).
 */
export class VerifyPhoneChangeDto {
  @ApiProperty({ example: '+966****4567', description: 'The new number the OTP was sent to' })
  @IsPhoneNumber('SA')
  phone: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP code' })
  @IsString()
  @Length(6, 6)
  code: string;
}
