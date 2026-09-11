import { IsPhoneNumber, IsString, Length, IsIn, IsOptional, IsBoolean } from 'class-validator';
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

  /** P2-11 exception (parity with the email channel): when true, the JWT is
   *  ALSO returned in the body. Required by prod's cross-origin topology
   *  (vercel.app PWA ↔ onrender API) where browsers refuse to store the
   *  cross-site `access_token` cookie — without it, phone-OTP signups on
   *  prod get a session with zero credentials and the first authed call
   *  401s (self-heal bounce to /login). Cookie is still set either way. */
  @ApiPropertyOptional({ description: 'Return the JWT in the body (cross-origin clients)' })
  @IsOptional()
  @IsBoolean()
  responseToken?: boolean;
}
