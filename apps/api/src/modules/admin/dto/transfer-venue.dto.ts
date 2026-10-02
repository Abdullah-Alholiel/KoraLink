import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

/**
 * Run #94 (Reviewer-A P2-136): admin mutation DTO caps.
 *
 * KoraLink id convention: ALL id columns are varchar(36) — never native
 * uuid. Id-shaped fields are shape-validated (UUID regex + @MaxLength(36))
 * per the MarkNoShowDto/CastVoteDto convention, NOT @IsUUID (documented
 * drift: @IsUUID is the wrong decorator for this schema).
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_SHAPE_MSG = 'must be a 36-char UUID-shaped id';

export class TransferVenueDto {
  @ApiProperty({ description: 'New owner user id — must be an existing VenueOwner' })
  @IsString()
  @Matches(UUID_SHAPE, { message: `newOwnerId ${UUID_SHAPE_MSG}` })
  @MaxLength(36)
  newOwnerId: string;
}
