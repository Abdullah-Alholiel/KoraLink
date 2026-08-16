import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsISO8601, IsOptional } from 'class-validator';

export class UpdateUserAdminDto {
  @ApiPropertyOptional({ enum: ['Player', 'VenueOwner', 'Admin'] })
  @IsOptional()
  @IsIn(['Player', 'VenueOwner', 'Admin'])
  role?: 'Player' | 'VenueOwner' | 'Admin';

  @ApiPropertyOptional({ description: 'true = ban, false = unban' })
  @IsOptional()
  @IsBoolean()
  banned?: boolean;

  @ApiPropertyOptional({
    description: 'ISO datetime to suspend until; null lifts suspension',
    type: 'string',
    nullable: true,
  })
  @IsOptional()
  @IsISO8601()
  suspendedUntil?: string | null;
}
