import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class CastVoteDto {
  @ApiProperty({
    description: 'The user ID of the player to vote for as Player of the Match',
    example: '31e5650e-2a38-4781-9807-913b9c913c90',
  })
  // Run #73 (Reviewer A minors): all KoraLink id columns are varchar(36) —
  // shape-validate (36 hex/dash chars, no UUID-scheme decorator) per the
  // MarkNoShowDto convention note. @MaxLength(36) also bounds the value before
  // it reaches any SQL bind.
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'candidateId must be a 36-char UUID-shaped id',
  })
  @MaxLength(36)
  candidateId: string;
}
