import { IsPhoneNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({ example: '+966501234567', description: 'Saudi phone number' })
  @IsPhoneNumber('SA')
  phone: string;

  // F1 (run #212): Cloudflare Turnstile token — REQUIRED in practice when the
  // API arms TURNSTILE_ENABLED (controller fails closed 400 CAPTCHA_REQUIRED
  // without a valid token); optional at the DTO layer so the flag stays the
  // single enablement switch and old clients get the coded 400, not a 400
  // class-validator shape.
  @ApiProperty({
    required: false,
    description: 'Cloudflare Turnstile widget token (required when TURNSTILE_ENABLED)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  turnstileToken?: string;
}
