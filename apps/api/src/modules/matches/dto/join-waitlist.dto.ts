import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class JoinWaitlistDto {
  // Reserved for future options (e.g. position preference). Kept so the wire
  // contract is object-shaped and forward-compatible.
  @ApiPropertyOptional({ description: 'Reserved for future options' })
  @IsOptional()
  @IsIn(['any'], { message: 'No waitlist options are supported yet.' })
  option?: 'any';
}
