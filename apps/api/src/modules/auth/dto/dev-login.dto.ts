import { IsPhoneNumber, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DevLoginDto {
  @ApiProperty({ example: '+966****0001', description: 'Saudi phone number of seeded user' })
  @IsPhoneNumber('SA')
  phone: string;

  /** Which app is logging in — enforces surface-level role separation:
   *  PWA (player) rejects staff roles; ops console rejects Players. */
  @ApiPropertyOptional({ enum: ['player', 'ops'], description: 'Calling surface' })
  @IsOptional()
  @IsIn(['player', 'ops'])
  surface?: 'player' | 'ops';
}
