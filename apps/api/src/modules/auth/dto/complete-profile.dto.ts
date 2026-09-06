import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteProfileDto {
  @ApiPropertyOptional({ example: 'Abdullah Al-Harbi' })
  @IsString()
  @MinLength(2)
  full_name: string;

  @ApiPropertyOptional({ example: 'abdu_striker' })
  @IsString()
  @MinLength(3)
  handle: string;

  @ApiPropertyOptional({ example: 'Riyadh' })
  @IsOptional()
  @IsString()
  preferred_location?: string;

  @ApiPropertyOptional({ example: 'Striker' })
  @IsOptional()
  @IsString()
  preferred_position?: string;
}
