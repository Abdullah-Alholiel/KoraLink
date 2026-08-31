import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class TransferVenueDto {
  @ApiProperty({ description: 'New owner user id — must be an existing VenueOwner' })
  @IsString()
  @IsNotEmpty()
  newOwnerId: string;
}
