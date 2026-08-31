import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateDisputeDto {
  @ApiPropertyOptional({ description: 'Decision text; null clears it' })
  @IsOptional()
  @IsString()
  decision?: string | null;

  @ApiPropertyOptional({ description: 'Internal note, admins only; null clears it' })
  @IsOptional()
  @IsString()
  internalNote?: string | null;
}
