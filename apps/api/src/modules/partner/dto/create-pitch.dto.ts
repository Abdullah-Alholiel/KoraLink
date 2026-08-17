import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePitchDto {
  @ApiProperty()
  @IsString()
  venue_id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: ['5v5', '7v7', '8v8', '11v11'] })
  @IsIn(['5v5', '7v7', '8v8', '11v11'])
  size: '5v5' | '7v7' | '8v8' | '11v11';

  @ApiProperty({ enum: ['Grass', 'Artificial'] })
  @IsIn(['Grass', 'Artificial'])
  surface_type: 'Grass' | 'Artificial';

  @ApiProperty({ enum: ['Indoor', 'Outdoor'] })
  @IsIn(['Indoor', 'Outdoor'])
  environment: 'Indoor' | 'Outdoor';

  @ApiProperty({ description: 'Hourly rate in SAR' })
  @IsNumber()
  @Min(0)
  hourly_rate: number;
}
