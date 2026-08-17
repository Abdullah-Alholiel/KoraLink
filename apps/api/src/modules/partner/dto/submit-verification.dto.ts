import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SubmitVerificationDto {
  @ApiProperty()
  @IsString()
  venue_id: string;

  @ApiProperty()
  @IsString()
  legal_entity_name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commercial_reg?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tax_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manager_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manager_phone?: string;
}
