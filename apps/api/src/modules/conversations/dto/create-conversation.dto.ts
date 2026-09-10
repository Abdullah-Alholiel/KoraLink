import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiProperty({ description: 'Target user ID to message', format: 'uuid' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  userId: string;
}
