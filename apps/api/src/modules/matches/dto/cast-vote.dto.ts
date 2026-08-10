import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CastVoteDto {
  @ApiProperty({
    description: 'The user ID of the player to vote for as Player of the Match',
    example: '31e5650e-2a38-4781-9807-913b9c913c90',
  })
  @IsString()
  candidateId: string;
}
