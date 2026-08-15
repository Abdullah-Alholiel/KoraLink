import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMatchMessageDto {
  @ApiProperty({ description: 'Message content', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({
    description: 'Client-generated idempotency key (retries deduplicate)',
    maxLength: 36,
  })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  clientMessageId?: string;
}
