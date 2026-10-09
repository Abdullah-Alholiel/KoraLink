import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsIn,
  IsArray,
  IsUUID,
} from 'class-validator';

export class BulkModerateUsersDto {
  @ApiProperty({ enum: ['ban', 'suspend'] })
  @IsIn(['ban', 'suspend'])
  action!: 'ban' | 'suspend';

  @ApiPropertyOptional({ description: '1..50 user ids (uuid)', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}
