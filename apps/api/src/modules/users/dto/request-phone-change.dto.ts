import { IsPhoneNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * P1-19 (run #44): step 1 of the phone-change flow — request a proof-of-
 * possession OTP for the NEW number. E.164 Saudi format, same validation
 * as the login send-otp DTO.
 */
export class RequestPhoneChangeDto {
  @ApiProperty({ example: '+966****4567', description: 'New Saudi phone number (E.164)' })
  @IsPhoneNumber('SA')
  phone: string;
}
