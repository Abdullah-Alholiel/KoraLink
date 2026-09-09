import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Body for POST /matches/:id/join.
 *
 * Player-host responsibility cycle (slice 2): joining a paid match now
 * charges the wallet INSIDE the join transaction. The client supplies an
 * idempotency key (UUID) generated per join attempt so a timeout/retry can
 * never double-charge: the key is stored on the MATCH_FEE transaction row
 * (unique), and a replay returns the original outcome instead of re-charging.
 *
 * Free matches (price_per_player = 0) charge nothing; the key is ignored.
 */
export class JoinMatchDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Client-generated idempotency key for the join payment. Same key + retry returns the original result without double-charging.',
  })
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}
