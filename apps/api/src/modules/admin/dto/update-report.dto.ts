import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateReportDto {
  @ApiPropertyOptional({ description: 'Resolution text; null clears it' })
  @IsOptional()
  @IsString()
  resolution?: string | null;
}
