import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarkReadDto {
  @ApiPropertyOptional({ description: 'Feed item IDs to mark read' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @ApiPropertyOptional({ description: 'Mark ALL notifications read' })
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
