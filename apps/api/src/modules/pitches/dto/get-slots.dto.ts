import { IsISO8601 } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetSlotsDto {
  @ApiProperty({ description: 'Date to query slots for (YYYY-MM-DD)' })
  @IsISO8601({ strict: true })
  date: string;
}
