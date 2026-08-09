import { IsPhoneNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DevLoginDto {
  @ApiProperty({ example: '+966****0001', description: 'Saudi phone number of seeded user' })
  @IsPhoneNumber('SA')
  phone: string;
}
