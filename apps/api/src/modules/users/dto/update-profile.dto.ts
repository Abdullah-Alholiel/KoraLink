import { IsString, IsOptional, MinLength, MaxLength, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
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
  skill_level?: 'Beginner' | 'Intermediate' | 'Advanced';

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

  @ApiPropertyOptional({ description: 'Home latitude (WGS-84)', minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  home_lat?: number;

  @ApiPropertyOptional({ description: 'Home longitude (WGS-84)', minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  home_lng?: number;
}
