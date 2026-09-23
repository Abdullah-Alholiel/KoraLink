import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateReportDto {
  @ApiPropertyOptional({ description: 'Resolution text; null clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string | null;
}
