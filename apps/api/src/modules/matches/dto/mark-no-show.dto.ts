import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsUUID } from 'class-validator';

export class MarkNoShowDto {
  @ApiProperty({ description: 'Target player user ID' })
  @IsUUID()
  targetUserId: string;

  @ApiProperty({ description: 'Whether the player is marked as no-show' })
  @IsBoolean()
  noShow: boolean;
}
