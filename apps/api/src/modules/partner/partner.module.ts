import { Module } from '@nestjs/common';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [GatewayModule],
  controllers: [PartnerController],
  providers: [PartnerService],
  // Exported so AdminModule can delegate slot/venue management to the same
  // service (admin bypasses ownership via actorRole='Admin').
  exports: [PartnerService],
})
export class PartnerModule {}
