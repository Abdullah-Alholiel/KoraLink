import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PostDisputeMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
