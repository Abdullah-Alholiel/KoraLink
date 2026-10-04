import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class BlockUserDto {
  @ApiProperty({
    description: 'The user ID to block',
    example: '31e5650e-2a38-4781-9807-913b9c913c90',
  })
  // All KoraLink id columns are varchar(36) — shape-validate (36 hex/dash
  // chars) per the CastVoteDto convention; @MaxLength(36) bounds the bind.
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, {
    message: 'blockedId must be a 36-char UUID-shaped id',
  })
  @MaxLength(36)
  blockedId: string;
}
