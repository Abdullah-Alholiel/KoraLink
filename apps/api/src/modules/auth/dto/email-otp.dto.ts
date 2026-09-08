import { IsEmail, IsString, Length, IsIn, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EmailSendOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;
}

export class EmailVerifyOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP code' })
  @IsString()
  @Length(6, 6)
  code: string;

  /** Which app is logging in — same surface separation as the phone flow. */
  @ApiPropertyOptional({ enum: ['player', 'ops'], description: 'Calling surface' })
  @IsOptional()
  @IsIn(['player', 'ops'])
  surface?: 'player' | 'ops';

  /**
   * P2-11 documented exception (email-otp-login Gate 2): when true, the JWT
   * is ALSO returned in the body. Exists solely because prod runs the API on
   * render.com while the PWA lives on vercel.app — SameSite=strict cookies
   * cannot cross that origin boundary. Explicit opt-in only.
   */
  @ApiPropertyOptional({ default: false, description: 'Return the JWT in the body (cross-origin deploys)' })
  @IsOptional()
  @IsBoolean()
  responseToken?: boolean;
}
