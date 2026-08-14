import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiProperty({ description: 'Target user ID to message' })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
