import { IsString, IsOptional, IsEnum, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SkillLevel } from '@prisma/client';

export class CompleteProfileDto {
  @ApiPropertyOptional({ example: 'Abdullah Al-Harbi' })
  @IsString()
  @MinLength(2)
  full_name: string;

  @ApiPropertyOptional({ example: 'abdu_striker' })
  @IsString()
  @MinLength(3)
  handle: string;

  @ApiPropertyOptional({ enum: SkillLevel })
  @IsOptional()
  @IsEnum(SkillLevel)
  skill_level?: SkillLevel;

  @ApiPropertyOptional({ example: 'Riyadh' })
  @IsOptional()
  @IsString()
  preferred_location?: string;

  @ApiPropertyOptional({ example: 'Striker' })
  @IsOptional()
  @IsString()
  preferred_position?: string;
}
