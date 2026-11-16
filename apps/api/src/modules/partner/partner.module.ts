import { Module } from '@nestjs/common';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';
import { AuditService } from '../admin/audit.service';
import { GatewayModule } from '../gateway/gateway.module';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  // Partner email lane (run #165): MailerModule is cycle-free (imports only
  // Config + its own Jwt instance) — safe to import here.
  imports: [GatewayModule, MailerModule],
  controllers: [PartnerController],
  providers: [PartnerService, AuditService],
  // Exported so AdminModule can delegate slot/venue management to the same
  // service (admin bypasses ownership via actorRole='Admin').
  exports: [PartnerService],
})
export class PartnerModule {}
