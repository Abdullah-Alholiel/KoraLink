import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { UUID_SHAPE, UUID_SHAPE_MSG } from '../../../common/validation/id-shape';

/**
 * Run #94 (Reviewer-A P2-136): admin mutation DTO caps. Id-shaped fields are
 * shape-validated per the varchar(36) house convention (see
 * common/validation/id-shape.ts) — NOT @IsUUID (documented drift).
 */
export class TransferVenueDto {
  @ApiProperty({ description: 'New owner user id — must be an existing VenueOwner' })
  @IsString()
  @Matches(UUID_SHAPE, { message: `newOwnerId ${UUID_SHAPE_MSG}` })
  @MaxLength(36)
  newOwnerId: string;
}
