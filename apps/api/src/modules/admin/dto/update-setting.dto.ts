import { ApiProperty } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';

export class UpdateSettingDto {
  @ApiProperty({ description: 'Any JSON-serializable value' })
  @IsDefined()
  value: unknown;
}
