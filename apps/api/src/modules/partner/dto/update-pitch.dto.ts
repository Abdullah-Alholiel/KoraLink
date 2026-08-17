import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePitchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['5v5', '7v7', '8v8', '11v11'] })
  @IsOptional()
  @IsIn(['5v5', '7v7', '8v8', '11v11'])
  size?: '5v5' | '7v7' | '8v8' | '11v11';

  @ApiPropertyOptional({ enum: ['Grass', 'Artificial'] })
  @IsOptional()
  @IsIn(['Grass', 'Artificial'])
  surface_type?: 'Grass' | 'Artificial';

  @ApiPropertyOptional({ enum: ['Indoor', 'Outdoor'] })
  @IsOptional()
  @IsIn(['Indoor', 'Outdoor'])
  environment?: 'Indoor' | 'Outdoor';

  @ApiPropertyOptional({ description: 'Hourly rate in SAR' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourly_rate?: number;

  @ApiPropertyOptional({ description: 'Availability status' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
