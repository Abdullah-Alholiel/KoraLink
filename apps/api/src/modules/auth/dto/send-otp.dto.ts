import { IsPhoneNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({ example: '+966501234567', description: 'Saudi phone number' })
  @IsPhoneNumber('SA')
  phone: string;
}
