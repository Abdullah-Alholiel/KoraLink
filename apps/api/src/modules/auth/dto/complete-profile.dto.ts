import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteProfileDto {
  @ApiPropertyOptional({ example: 'Abdullah Al-Harbi' })
  @IsString()
  @MinLength(2)
  full_name: string;

  // Cutover Card 2 (2026-11-16): optional — when omitted the server derives
  // the handle from full_name (slugifyHandle) and auto-picks a free one on
  // collision (pickFreeHandle). When sent (legacy clients), a taken handle
  // still auto-resolves server-side; a handle already owned by this same
  // user passes through untouched.
  @ApiPropertyOptional({ example: 'abdu_striker' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  handle?: string;

  @ApiPropertyOptional({ example: 'Riyadh' })
  @IsOptional()
  @IsString()
  preferred_location?: string;

  @ApiPropertyOptional({ example: 'Striker' })
  @IsOptional()
  @IsString()
  preferred_position?: string;
}
