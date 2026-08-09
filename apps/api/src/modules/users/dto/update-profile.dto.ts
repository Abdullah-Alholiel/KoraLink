import { IsString, IsOptional, MinLength, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'User full name', minLength: 2, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  full_name?: string;

  @ApiPropertyOptional({ description: 'Unique handle', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  handle?: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  avatar_url?: string;

  @ApiPropertyOptional({
    enum: ['Beginner', 'Intermediate', 'Advanced'],
    description: 'Skill level',
  })
  @IsOptional()
  @IsEnum(['Beginner', 'Intermediate', 'Advanced'])
  skill_level?: string;

  @ApiPropertyOptional({ description: 'Preferred location', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  preferred_location?: string;

  @ApiPropertyOptional({ description: 'Preferred position', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  preferred_position?: string;
}
