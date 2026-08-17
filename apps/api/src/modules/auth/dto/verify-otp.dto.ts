import { IsPhoneNumber, IsString, Length, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: '+966****4567' })
  @IsPhoneNumber('SA')
  phone: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP code' })
  @IsString()
  @Length(6, 6)
  code: string;

  /** Which app is logging in — enforces surface-level role separation:
   *  PWA (player) rejects staff roles; ops console rejects Players. */
  @ApiPropertyOptional({ enum: ['player', 'ops'], description: 'Calling surface' })
  @IsOptional()
  @IsIn(['player', 'ops'])
  surface?: 'player' | 'ops';
}
