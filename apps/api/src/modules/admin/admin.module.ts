import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { AdminUsersService } from './users.service';
import { AdminUsersController } from './users.controller';
import { AdminVenuesService } from './venues.service';
import { AdminVenuesController } from './venues.controller';
import { AdminDisputesService } from './disputes.service';
import { AdminDisputesController } from './disputes.controller';
import { AdminReportsService } from './reports.service';
import { AdminReportsController } from './reports.controller';
import { AdminTransactionsService } from './transactions.service';
import { AdminTransactionsController } from './transactions.controller';
import { AdminSettlementsService } from './settlements.service';
import { AdminSettlementsController } from './settlements.controller';
import { AdminSettingsService } from './settings.service';
import { AdminSettingsController } from './settings.controller';
import { AdminAuditController } from './audit.controller';
import { AdminMatchesService } from './matches.service';
import { AdminMatchesController } from './matches.controller';
import { MatchesModule } from '../matches/matches.module';
import { GatewayModule } from '../gateway/gateway.module';
import { ActivitiesModule } from '../activities/activities.module';

@Module({
  imports: [MatchesModule, GatewayModule, ActivitiesModule],
  controllers: [
    MetricsController,
    AdminUsersController,
    AdminVenuesController,
    AdminDisputesController,
    AdminReportsController,
    AdminTransactionsController,
    AdminSettlementsController,
    AdminSettingsController,
    AdminAuditController,
    AdminMatchesController,
  ],
  providers: [
    AuditService,
    MetricsService,
    AdminUsersService,
    AdminVenuesService,
    AdminDisputesService,
    AdminReportsService,
    AdminTransactionsService,
    AdminSettlementsService,
    AdminSettingsService,
    AdminMatchesService,
  ],
  exports: [AuditService],
})
export class AdminModule {}
