import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

/** P1-41 (run #35) — set/replace the account email. */
export class SetEmailDto {
  @ApiProperty({ description: 'The email address to set (a verification email is sent)', maxLength: 255 })
  @IsEmail({}, { message: 'Invalid email address.' })
  @IsString()
  @MaxLength(255)
  email!: string;
}
